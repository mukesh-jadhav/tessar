"""Prompt+response cache for the LLM router.

Per `architecture.instructions.md` LLM tier policy:

> Aggressive prompt+retrieval caching in Redis (key: normalized input
> hash + KB snapshot id).

Why: at MVP scale, agent prompts are deterministic templates + a small
amount of run-specific context (brief, retrieval hits). Two runs with
similar briefs share most of the agent calls verbatim — caching the
synthesizer or risk-writer responses cuts per-run cost by an order of
magnitude on repeat-shaped briefs.

Design choices (locked by ADR-0018):
  - Cache key = sha256 over (canonical_messages_json, agent_name, tier,
    max_tokens, temperature, kb_snapshot_id, cache_version). Provider
    identity is INTENTIONALLY excluded — within a tier, providers are
    fungible from the agent's perspective.
  - Caching is BYPASSED when `temperature > 0.3`. Creative agents
    (e.g. risk-writer brainstorming) shouldn't be deterministic.
  - TTL defaults to 7 days. KB snapshot id is part of the key, so a KB
    refresh naturally invalidates stale answers (no manual flush needed).
  - Cache hit returns the cached `LlmResponse` with `cache_hit=True` and
    `usage` zeroed — hits do NOT bill against the run's budget.
  - Redis failures DEGRADE gracefully (log + miss). The cache is a cost
    optimization, never a correctness boundary.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import threading
from abc import ABC, abstractmethod
from collections import OrderedDict
from collections.abc import Sequence

from .types import LlmMessage, LlmResponse, LlmUsage, Tier

log = logging.getLogger(__name__)

# Bump when the cached payload shape changes — invalidates the whole
# namespace without needing to wipe Redis.
CACHE_VERSION = "v1"

# Default TTL: 7 days. Long enough that repeated runs hit cached agent
# calls; short enough that any drift between KB-snapshot-bound prompts
# and real Vertex behaviour ages out within a sprint.
DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60

# Above this temperature the model is being asked for creative variety;
# returning the same answer twice would defeat the purpose. Keep aligned
# with the router's default of 0.2 — typical agents at 0.2 cache, while
# higher-temperature exploratory calls explicitly bypass.
CACHE_TEMPERATURE_CEILING = 0.3


# ─── Key building ────────────────────────────────────────────────


def _canonical_messages(messages: Sequence[LlmMessage]) -> list[dict[str, str]]:
    """Strip non-content fields and freeze ordering — content + role are
    the only inputs that matter for response equivalence."""
    return [{"role": m.role, "content": m.content} for m in messages]


def build_cache_key(
    messages: Sequence[LlmMessage],
    *,
    agent_name: str,
    tier: Tier,
    max_tokens: int,
    temperature: float,
    kb_snapshot_id: str | None,
) -> str:
    """Deterministic sha256 hex over the inputs that influence the
    completion. Order of fields is fixed and JSON is serialized with
    sorted keys so equivalent calls hash identically across processes."""
    payload = {
        "v": CACHE_VERSION,
        "agent": agent_name,
        "tier": tier.value,
        "max_tokens": int(max_tokens),
        # Round temperature to 3 dp so 0.2 == 0.20000000000000001.
        "temperature": round(float(temperature), 3),
        "kb_snapshot_id": kb_snapshot_id or "",
        "messages": _canonical_messages(messages),
    }
    blob = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


# ─── Cache ABC + implementations ─────────────────────────────────


class PromptCache(ABC):
    """One cache instance is shared by all routers in a process."""

    @abstractmethod
    def get(self, key: str) -> LlmResponse | None:
        """Return the cached response or None on miss / decode failure."""

    @abstractmethod
    def set(self, key: str, response: LlmResponse, *, ttl_seconds: int) -> None:
        """Store the response. Failures must be logged + swallowed —
        the cache is never a correctness boundary."""


class MemoryPromptCache(PromptCache):
    """Process-local LRU. Used for tests + dev when REDIS_URL is unset."""

    def __init__(self, maxsize: int = 512) -> None:
        if maxsize < 1:
            raise ValueError("maxsize must be ≥1")
        self._maxsize = maxsize
        # OrderedDict preserves insertion/access order for LRU eviction.
        self._store: OrderedDict[str, LlmResponse] = OrderedDict()
        self._lock = threading.Lock()

    def get(self, key: str) -> LlmResponse | None:
        with self._lock:
            value = self._store.get(key)
            if value is None:
                return None
            # LRU bump — recently read entries stay alive.
            self._store.move_to_end(key)
            return value

    def set(self, key: str, response: LlmResponse, *, ttl_seconds: int) -> None:
        # TTL ignored in-memory; LRU eviction is the policy here.
        with self._lock:
            self._store[key] = response
            self._store.move_to_end(key)
            while len(self._store) > self._maxsize:
                self._store.popitem(last=False)


class RedisPromptCache(PromptCache):
    """Sync Redis-backed cache. Uses the same `REDIS_URL` as the live
    progress bus (see `tessar/redis_bus.py`); on Cloud Run that's the
    Memorystore Basic instance behind the VPC connector."""

    def __init__(
        self,
        client,  # redis.Redis (sync) — not type-annotated to keep import optional
        *,
        namespace: str = "tessar:llm:cache",
    ) -> None:
        self._client = client
        self._ns = namespace

    def _full_key(self, key: str) -> str:
        return f"{self._ns}:{CACHE_VERSION}:{key}"

    def get(self, key: str) -> LlmResponse | None:
        try:
            blob = self._client.get(self._full_key(key))
        except Exception as exc:  # pragma: no cover — logged for ops
            log.warning("llm.cache.get_failed err=%s", exc)
            return None
        if blob is None:
            return None
        try:
            data = json.loads(blob if isinstance(blob, str) else blob.decode("utf-8"))
            # Round-trip through Pydantic — handles tier enum + nested usage.
            return LlmResponse.model_validate(data)
        except Exception as exc:  # pragma: no cover — corrupt entry
            log.warning("llm.cache.decode_failed err=%s key=%s", exc, key)
            return None

    def set(self, key: str, response: LlmResponse, *, ttl_seconds: int) -> None:
        try:
            blob = response.model_dump_json()
            self._client.set(self._full_key(key), blob, ex=ttl_seconds)
        except Exception as exc:  # pragma: no cover — logged for ops
            log.warning("llm.cache.set_failed err=%s", exc)


# ─── Cache-hit response materialization ──────────────────────────


def materialize_hit(cached: LlmResponse) -> LlmResponse:
    """Return a clone with `cache_hit=True` and `usage` zeroed.

    Zeroing usage is what makes the cache actually save money: the
    router billed (and charged the budget for) the original call; a
    cache hit is free. The audit tab + cost dashboards use this signal
    to distinguish billed calls from cached ones.
    """
    return cached.model_copy(
        update={
            "cache_hit": True,
            "usage": LlmUsage(prompt_tokens=0, completion_tokens=0, cost_usd=0.0),
        }
    )


# ─── Factory ─────────────────────────────────────────────────────


def build_prompt_cache() -> PromptCache:
    """Return a real Redis cache when `REDIS_URL` is set; else an
    in-process LRU. Mirrors `build_embedder()` and the rest of the
    'real → mock at the seam' pattern.
    """
    url = os.environ.get("REDIS_URL")
    if not url:
        log.info("llm.cache.memory_backend (REDIS_URL unset)")
        return MemoryPromptCache()

    try:
        import redis  # sync client — import lazily to keep redis truly optional
    except ImportError:  # pragma: no cover — `redis` ships with the worker
        log.warning("llm.cache.memory_backend (redis package missing)")
        return MemoryPromptCache()

    # Same TLS handling as `redis_bus.py::_client()`: Memorystore uses a
    # self-signed CA over a private IP, so we disable verification for
    # `rediss://`. The network path itself is private.
    if url.startswith("rediss://"):
        client = redis.from_url(url, decode_responses=True, ssl_cert_reqs=None)
    else:
        client = redis.from_url(url, decode_responses=True)
    log.info("llm.cache.redis_backend url=%s", _safe_url(url))
    return RedisPromptCache(client)


def _safe_url(url: str) -> str:
    """Strip credentials from a Redis URL before logging."""
    # Crude but effective; we just want the host:port for ops.
    if "@" in url:
        scheme, rest = url.split("://", 1)
        _, host = rest.split("@", 1)
        return f"{scheme}://{host}"
    return url


__all__ = [
    "CACHE_TEMPERATURE_CEILING",
    "CACHE_VERSION",
    "DEFAULT_TTL_SECONDS",
    "MemoryPromptCache",
    "PromptCache",
    "RedisPromptCache",
    "build_cache_key",
    "build_prompt_cache",
    "materialize_hit",
]
