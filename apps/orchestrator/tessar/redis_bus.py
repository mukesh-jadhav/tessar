"""Redis Streams adapter for live run-progress events.

Worker → Redis Stream → web SSE. The stream payload IS the SSE wire
format consumed by ``/run/[id]`` (see
``apps/web/lib/mocks/recorded-run.ts``: ``RecordedEvent``), so the same
JSON survives Redis trimming and lands in the browser unchanged.

Single async client cached at module scope. Local dev hits docker-compose
Redis at ``localhost:6379``; Cloud Run hits Memorystore on a private IP.
"""

from __future__ import annotations

import json
import os
from functools import lru_cache

import redis.asyncio as redis
import structlog

from tessar.config import settings  # noqa: F401  (ensures .env is loaded)

log = structlog.get_logger(__name__)

# Cap the stream so a stuck consumer cannot OOM Memorystore. One run
# emits ~50 events at MVP, so 10k gives us ~200 runs of headroom. The
# durable copy lives in Postgres ``run_events``.
STREAM_MAXLEN = 10_000


@lru_cache(maxsize=1)
def _client() -> redis.Redis:
    url = os.environ.get("REDIS_URL", "redis://localhost:6379")
    # decode_responses=True so XRANGE returns str, not bytes — keeps the
    # SSE route in web symmetric (ioredis returns strings by default).
    #
    # Memorystore (rediss://) presents a self-signed CA reachable only on
    # a private IP inside our VPC connector. Without the CA bundle the
    # client can't verify it, so we disable hostname/cert verification
    # for `rediss://` only — the connection is still encrypted, and the
    # network path itself is private. If Redis is ever exposed publicly,
    # provide the CA via `ssl_ca_certs=...` instead.
    if url.startswith("rediss://"):
        return redis.from_url(
            url,
            decode_responses=True,
            ssl_cert_reqs=None,
        )
    return redis.from_url(url, decode_responses=True)


def stream_key(run_id: str) -> str:
    return f"run:{run_id}:events"


async def publish(run_id: str, event: dict[str, object]) -> None:
    """Append one wire-format event to the run's Redis Stream.

    The stream entry has a single field ``data`` containing the JSON
    blob. The wire format is the contract — do not add per-field columns
    here.
    """
    client = _client()
    payload = {"data": json.dumps(event, separators=(",", ":"))}
    try:
        await client.xadd(
            stream_key(run_id),
            payload,
            maxlen=STREAM_MAXLEN,
            approximate=True,
        )
    except Exception as exc:  # pragma: no cover - logged for ops
        # Redis being down must NOT take the worker down — Postgres still
        # has the durable copy. Web SSE will degrade to "no live tail".
        log.warning("redis.publish_failed", run_id=run_id, error=str(exc))
