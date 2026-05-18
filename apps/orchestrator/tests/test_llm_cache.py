"""Tests for the LLM prompt cache + its integration with the router.

Covers:
  - cache_key determinism + sensitivity to every input that influences
    the completion
  - MemoryPromptCache LRU semantics
  - RedisPromptCache happy path + decode-failure + connection-failure
  - Router cache lookup + skip-above-temperature-ceiling
  - `cache_hit` zeroes usage so the run budget isn't double-charged
"""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from tessar.llm import BudgetTracker, LlmMessage, LlmRouter, Tier
from tessar.llm.cache import (
    CACHE_TEMPERATURE_CEILING,
    DEFAULT_TTL_SECONDS,
    MemoryPromptCache,
    RedisPromptCache,
    build_cache_key,
    materialize_hit,
)
from tessar.llm.providers.mock import MockLlmProvider
from tessar.llm.types import LlmResponse, LlmUsage

# ─── helpers ─────────────────────────────────────────────────────


def _msg(content: str = "hi", role: str = "user") -> LlmMessage:
    return LlmMessage(role=role, content=content)


def _response(text: str = "ok", *, cost: float = 0.01) -> LlmResponse:
    return LlmResponse(
        text=text,
        provider="mock",
        model="mock-tier-A",
        tier=Tier.A,
        usage=LlmUsage(prompt_tokens=10, completion_tokens=5, cost_usd=cost),
    )


# ─── cache_key ───────────────────────────────────────────────────


def test_cache_key_is_deterministic_across_calls() -> None:
    """Same inputs ⇒ same key. The cache contract relies on this."""
    args = dict(
        agent_name="synthesizer",
        tier=Tier.A,
        max_tokens=512,
        temperature=0.2,
        kb_snapshot_id="kb-2026-05-01",
    )
    k1 = build_cache_key([_msg("hello")], **args)
    k2 = build_cache_key([_msg("hello")], **args)
    assert k1 == k2
    assert len(k1) == 64  # sha256 hex


def test_cache_key_changes_on_message_change() -> None:
    args = dict(
        agent_name="synthesizer",
        tier=Tier.A,
        max_tokens=512,
        temperature=0.2,
        kb_snapshot_id="kb-1",
    )
    assert build_cache_key([_msg("a")], **args) != build_cache_key([_msg("b")], **args)


def test_cache_key_changes_on_agent_change() -> None:
    base = dict(
        tier=Tier.A,
        max_tokens=512,
        temperature=0.2,
        kb_snapshot_id="kb-1",
    )
    k1 = build_cache_key([_msg("x")], agent_name="synthesizer", **base)
    k2 = build_cache_key([_msg("x")], agent_name="architect", **base)
    assert k1 != k2


def test_cache_key_changes_on_kb_snapshot_change() -> None:
    """A KB refresh must invalidate cached answers — this is the
    promised mechanism, so it has its own test."""
    base = dict(
        agent_name="synthesizer",
        tier=Tier.A,
        max_tokens=512,
        temperature=0.2,
    )
    k1 = build_cache_key([_msg("x")], kb_snapshot_id="kb-1", **base)
    k2 = build_cache_key([_msg("x")], kb_snapshot_id="kb-2", **base)
    assert k1 != k2


def test_cache_key_changes_on_temperature_change() -> None:
    base = dict(
        agent_name="x",
        tier=Tier.B,
        max_tokens=512,
        kb_snapshot_id="kb-1",
    )
    assert build_cache_key([_msg("x")], temperature=0.0, **base) != build_cache_key(
        [_msg("x")], temperature=0.3, **base
    )


def test_cache_key_rounds_temperature_to_3dp() -> None:
    """Floating-point jitter on temperature mustn't shatter the cache."""
    base = dict(
        agent_name="x",
        tier=Tier.B,
        max_tokens=512,
        kb_snapshot_id="kb-1",
    )
    assert build_cache_key([_msg("x")], temperature=0.2, **base) == build_cache_key(
        [_msg("x")], temperature=0.20001, **base
    )


def test_cache_key_changes_on_max_tokens_change() -> None:
    base = dict(
        agent_name="x",
        tier=Tier.A,
        temperature=0.2,
        kb_snapshot_id="kb-1",
    )
    assert build_cache_key([_msg("x")], max_tokens=256, **base) != build_cache_key(
        [_msg("x")], max_tokens=512, **base
    )


def test_cache_key_treats_none_snapshot_as_empty_string() -> None:
    """None and '' must hash identically — both mean 'no snapshot bound'."""
    base = dict(agent_name="x", tier=Tier.C, max_tokens=128, temperature=0.0)
    assert build_cache_key([_msg("x")], kb_snapshot_id=None, **base) == build_cache_key(
        [_msg("x")], kb_snapshot_id="", **base
    )


# ─── MemoryPromptCache ───────────────────────────────────────────


def test_memory_cache_round_trip() -> None:
    c = MemoryPromptCache()
    r = _response("hello")
    c.set("k1", r, ttl_seconds=DEFAULT_TTL_SECONDS)
    got = c.get("k1")
    assert got is not None
    assert got.text == "hello"
    assert got.usage.cost_usd == pytest.approx(0.01)


def test_memory_cache_miss_returns_none() -> None:
    assert MemoryPromptCache().get("missing") is None


def test_memory_cache_lru_evicts_oldest() -> None:
    c = MemoryPromptCache(maxsize=2)
    c.set("a", _response("A"), ttl_seconds=1)
    c.set("b", _response("B"), ttl_seconds=1)
    c.set("c", _response("C"), ttl_seconds=1)  # evicts "a"
    assert c.get("a") is None
    assert c.get("b") is not None
    assert c.get("c") is not None


def test_memory_cache_get_bumps_to_most_recent() -> None:
    """Read-bump matters — frequently-read entries shouldn't be evicted."""
    c = MemoryPromptCache(maxsize=2)
    c.set("a", _response("A"), ttl_seconds=1)
    c.set("b", _response("B"), ttl_seconds=1)
    c.get("a")  # bump "a" to MRU
    c.set("c", _response("C"), ttl_seconds=1)  # should evict "b", not "a"
    assert c.get("a") is not None
    assert c.get("b") is None
    assert c.get("c") is not None


def test_memory_cache_rejects_nonpositive_maxsize() -> None:
    with pytest.raises(ValueError):
        MemoryPromptCache(maxsize=0)


# ─── RedisPromptCache ────────────────────────────────────────────


def test_redis_cache_uses_namespace_and_version_in_key() -> None:
    client = MagicMock()
    cache = RedisPromptCache(client, namespace="ns")
    cache.set("abc", _response(), ttl_seconds=42)
    client.set.assert_called_once()
    sent_key = client.set.call_args[0][0]
    assert sent_key.startswith("ns:v")  # namespace + version prefix
    assert sent_key.endswith("abc")


def test_redis_cache_round_trip_via_real_dict() -> None:
    """Use a tiny dict-backed fake for the round trip — exercises the
    JSON encode/decode path, which is the most error-prone part."""
    store: dict[str, str] = {}

    class _Fake:
        def get(self, k):
            return store.get(k)

        def set(self, k, v, ex=None):
            store[k] = v

    cache = RedisPromptCache(_Fake(), namespace="ns")
    cache.set("k", _response("payload"), ttl_seconds=10)
    got = cache.get("k")
    assert got is not None
    assert got.text == "payload"
    assert got.tier == Tier.A


def test_redis_cache_get_failure_is_swallowed() -> None:
    """Caching is never a correctness boundary — a failing Redis must
    behave like a miss, not crash the run."""
    client = MagicMock()
    client.get.side_effect = ConnectionError("redis down")
    cache = RedisPromptCache(client)
    assert cache.get("anything") is None


def test_redis_cache_set_failure_is_swallowed() -> None:
    client = MagicMock()
    client.set.side_effect = ConnectionError("redis down")
    cache = RedisPromptCache(client)
    # Must not raise.
    cache.set("k", _response(), ttl_seconds=10)


def test_redis_cache_corrupt_payload_returns_none() -> None:
    client = MagicMock()
    client.get.return_value = "{not valid json"
    cache = RedisPromptCache(client)
    assert cache.get("k") is None


# ─── materialize_hit ─────────────────────────────────────────────


def test_materialize_hit_zeroes_usage_and_marks_hit() -> None:
    """Cache hits must not bill against the budget — usage must be
    zeroed and `cache_hit=True` must be set."""
    cached = _response("hello", cost=0.42)
    hit = materialize_hit(cached)
    assert hit.cache_hit is True
    assert hit.text == "hello"
    assert hit.usage.cost_usd == 0.0
    assert hit.usage.total_tokens == 0
    # Original must be unchanged (Pydantic model_copy returns a clone).
    assert cached.cache_hit is False
    assert cached.usage.cost_usd == 0.42


# ─── Router integration ──────────────────────────────────────────


def test_router_serves_cached_response_on_second_call() -> None:
    """The router consults the cache before estimating cost; a second
    call with identical inputs must return the cached payload without
    touching the provider."""
    provider = MockLlmProvider()
    cache = MemoryPromptCache()
    router = LlmRouter(
        [provider],
        BudgetTracker(cap_usd=1.0, cap_tokens=10_000),
        cache=cache,
        kb_snapshot_id="kb-test",
    )

    msgs = [_msg("identical")]
    r1 = router.generate(msgs, agent_name="synthesizer", max_tokens=64)
    assert r1.cache_hit is False
    assert r1.usage.cost_usd > 0
    first_cost = r1.usage.cost_usd

    r2 = router.generate(msgs, agent_name="synthesizer", max_tokens=64)
    assert r2.cache_hit is True
    assert r2.usage.cost_usd == 0.0
    # Cached body must equal the original (sans usage).
    assert r2.text == r1.text
    # Budget should only have been charged once.
    assert router.budget.state().spent_usd == pytest.approx(first_cost)


def test_router_bypasses_cache_above_temperature_ceiling() -> None:
    """Creative calls must not be cached — verify both miss AND no store."""
    provider = MockLlmProvider()
    cache = MagicMock(spec=MemoryPromptCache)
    cache.get.return_value = None
    router = LlmRouter(
        [provider],
        BudgetTracker(cap_usd=1.0, cap_tokens=10_000),
        cache=cache,
        kb_snapshot_id="kb-test",
    )
    router.generate(
        [_msg("x")],
        agent_name="synthesizer",
        max_tokens=64,
        temperature=CACHE_TEMPERATURE_CEILING + 0.05,
    )
    cache.get.assert_not_called()
    cache.set.assert_not_called()


def test_router_caches_at_ceiling_boundary() -> None:
    """`temperature == CACHE_TEMPERATURE_CEILING` must STILL cache —
    the bypass is strictly above, not inclusive."""
    provider = MockLlmProvider()
    cache = MemoryPromptCache()
    router = LlmRouter(
        [provider],
        BudgetTracker(cap_usd=1.0, cap_tokens=10_000),
        cache=cache,
        kb_snapshot_id="kb-test",
    )
    router.generate(
        [_msg("boundary")],
        agent_name="synthesizer",
        max_tokens=64,
        temperature=CACHE_TEMPERATURE_CEILING,
    )
    r2 = router.generate(
        [_msg("boundary")],
        agent_name="synthesizer",
        max_tokens=64,
        temperature=CACHE_TEMPERATURE_CEILING,
    )
    assert r2.cache_hit is True


def test_router_kb_snapshot_id_change_invalidates_cache() -> None:
    """Setting a different snapshot id mid-run (as the runner does after
    retrieval) must mean the next call is a fresh miss, not a stale hit."""
    provider = MockLlmProvider()
    cache = MemoryPromptCache()
    router = LlmRouter(
        [provider],
        BudgetTracker(cap_usd=1.0, cap_tokens=10_000),
        cache=cache,
        kb_snapshot_id="kb-old",
    )
    r1 = router.generate([_msg("q")], agent_name="synthesizer", max_tokens=64)
    assert r1.cache_hit is False

    router.set_kb_snapshot_id("kb-new")
    r2 = router.generate([_msg("q")], agent_name="synthesizer", max_tokens=64)
    assert r2.cache_hit is False  # KB id changed → new key → miss
    # And a follow-up under the new id IS a hit.
    r3 = router.generate([_msg("q")], agent_name="synthesizer", max_tokens=64)
    assert r3.cache_hit is True


def test_router_without_cache_works_as_before() -> None:
    """Backwards compat — omitting cache must keep the router behaving
    exactly as it did before this commit."""
    provider = MockLlmProvider()
    router = LlmRouter([provider], BudgetTracker(cap_usd=1.0, cap_tokens=10_000))
    r1 = router.generate([_msg("noop")], agent_name="synthesizer", max_tokens=64)
    r2 = router.generate([_msg("noop")], agent_name="synthesizer", max_tokens=64)
    # No cache → both calls bill the provider.
    assert r1.cache_hit is False
    assert r2.cache_hit is False
    assert router.budget.state().spent_usd == pytest.approx(r1.usage.cost_usd + r2.usage.cost_usd)
