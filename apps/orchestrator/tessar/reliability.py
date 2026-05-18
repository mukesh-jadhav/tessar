"""Reliability primitives for the brief-run pipeline.

Centralises the boring-but-critical patterns that the runner needs to
survive contact with production:

* :func:`with_db_retry` — exponential-backoff retry wrapper for
  Postgres/Redis/GCS calls that can blip on transient infra failures
  (connection resets, leader elections, brief network drops). We retry
  only on a curated allow-list of exception types; integrity / schema /
  auth errors fall through immediately.

* :func:`handle_agent_failure` — single funnel for every agent
  exception in the runner. Logs with full traceback, captures to Sentry
  with structured tags (``run_id``, ``agent``, ``error_type``,
  ``error_class``), marks the run failed in Postgres, emits a typed
  ``phase: failed`` event so the UI shows a real failure pill (not a
  forever-spinner), and returns ``None`` so the runner's caller can
  early-exit cleanly.

* :class:`TransientInfraError` — sentinel base class for "retry-safe"
  exceptions; user code can raise this directly when a callable knows
  the call can be safely re-attempted.

Design constraints:

* **Fail-soft on observability.** A broken Sentry/Postgres write must
  never compound a real run failure into a worker crash. Every
  side-effect inside the helpers is wrapped so it cannot itself raise.
* **Idempotent.** Calling :func:`handle_agent_failure` twice for the
  same run is harmless; the DB write is a status flip and the event
  emission is append-only.
* **No agent imports.** This module only knows about generic
  exception shapes (``Exception``, ``BudgetExceeded``,
  ``AllProvidersFailed``) so it can wrap any agent without circular
  imports.

See ADR-0013 for the wider contract.
"""

from __future__ import annotations

import asyncio
import random
from collections.abc import Awaitable, Callable
from typing import Any, TypeVar

import structlog

log = structlog.get_logger(__name__)

T = TypeVar("T")


# ─── transient-error taxonomy ────────────────────────────────────────


class TransientInfraError(Exception):
    """Raise from inside a retryable callable to force a retry without
    relying on third-party exception types.

    The :func:`with_db_retry` helper treats every subclass as retryable.
    Catch this in production code when you know a network call failed
    in a way the next attempt would survive.
    """


# Common SQLAlchemy / asyncpg / Redis transient signatures. We import
# lazily so this module stays cheap to import in tests that don't need
# the DB at all.
def _default_retryable_types() -> tuple[type[BaseException], ...]:
    types: list[type[BaseException]] = [TransientInfraError, ConnectionError, TimeoutError]
    try:
        from sqlalchemy.exc import (  # type: ignore[import-untyped]
            DBAPIError,
            DisconnectionError,
            OperationalError,
        )

        types.extend([DBAPIError, DisconnectionError, OperationalError])
    except ImportError:  # pragma: no cover — SQLAlchemy optional in tests
        pass
    try:
        from redis.exceptions import (  # type: ignore[import-untyped]
            ConnectionError as RedisConnectionError,
        )
        from redis.exceptions import (
            TimeoutError as RedisTimeoutError,
        )

        types.extend([RedisConnectionError, RedisTimeoutError])
    except ImportError:  # pragma: no cover
        pass
    return tuple(types)


_RETRYABLE: tuple[type[BaseException], ...] = _default_retryable_types()


# ─── retry helper ────────────────────────────────────────────────────


async def with_db_retry(
    fn: Callable[[], Awaitable[T]],
    *,
    op: str,
    max_attempts: int = 3,
    base_delay_s: float = 0.5,
    max_delay_s: float = 4.0,
    retryable: tuple[type[BaseException], ...] | None = None,
) -> T:
    """Retry an async callable on transient infra errors.

    Parameters
    ----------
    fn:
        Zero-arg async callable. Wrap your real call in a ``lambda``
        or local ``async def`` to bind arguments.
    op:
        Short slug used in log lines (``"load_brief"``, ``"emit_event"``).
        Required, never optional — anonymous retries are unobservable.
    max_attempts:
        Total number of attempts including the first. Default 3.
    base_delay_s:
        First retry backoff. Doubled each subsequent attempt with up
        to ±25 % jitter to avoid thundering herds when many runs trip
        the same blip.
    max_delay_s:
        Cap on the exponential backoff so we don't sleep absurdly long
        before failing the run.
    retryable:
        Override the default transient-exception allow-list. Useful in
        tests; in production prefer the default.

    Raises
    ------
    The last exception caught if all attempts fail, OR any non-retryable
    exception immediately on first encounter (no retries for integrity
    / auth / schema errors).
    """
    if max_attempts < 1:
        raise ValueError("max_attempts must be >= 1")
    allow = retryable if retryable is not None else _RETRYABLE

    last_exc: BaseException | None = None
    for attempt in range(1, max_attempts + 1):
        try:
            return await fn()
        except allow as exc:
            last_exc = exc
            if attempt >= max_attempts:
                log.error(
                    "reliability.retry_exhausted",
                    op=op,
                    attempt=attempt,
                    max_attempts=max_attempts,
                    error=str(exc),
                    error_class=type(exc).__name__,
                )
                raise
            delay = min(max_delay_s, base_delay_s * (2 ** (attempt - 1)))
            # ±25 % jitter so simultaneously-failing runs don't all
            # retry on the same tick.
            delay *= 0.75 + random.random() * 0.5
            log.warning(
                "reliability.retry_scheduled",
                op=op,
                attempt=attempt,
                next_delay_s=round(delay, 3),
                error=str(exc),
                error_class=type(exc).__name__,
            )
            await asyncio.sleep(delay)
    # Unreachable: the loop either returns, raises, or sleeps and continues.
    assert last_exc is not None  # for the type checker
    raise last_exc


# ─── agent failure funnel ────────────────────────────────────────────


# Stable failure-classification slugs surfaced on the event payload's
# ``note`` field. Kept narrow on purpose — UI copy reads from this set,
# adding new ones is a UI contract change.
ERROR_NOTES: dict[str, str] = {
    "validation": "agent produced invalid output twice",
    "ungrounded": "agent produced ungrounded output twice",
    "providers_failed": "every LLM provider timed out or failed",
    "budget_exceeded": "per-run token budget exceeded",
    "unexpected": "unexpected internal error \u2014 captured for investigation",
    "crash_recovery": "previous attempt crashed; refusing to re-run automatically",
}


def classify_agent_error(exc: BaseException) -> str:
    """Map an exception to one of the :data:`ERROR_NOTES` keys.

    The classification is structural — we look at the exception class
    name rather than walking attributes, so this stays a one-line
    decision tree.
    """
    name = type(exc).__name__
    if name == "BudgetExceeded":
        return "budget_exceeded"
    if name == "AllProvidersFailed":
        return "providers_failed"
    # Agent-specific *Error subclasses end in "Error" and carry their
    # own classification semantics — but the runner already caught
    # them upstream. This funnel is for everything else.
    return "unexpected"


async def handle_agent_failure(
    *,
    run_id: str,
    agent: str,
    exc: BaseException,
    phase_event_t: int,
    mark_failed: Callable[[str], Awaitable[None]],
    emit: Callable[[str, dict[str, Any]], Awaitable[None]],
    classification: str | None = None,
) -> None:
    """One-stop handler for every agent failure in the runner.

    Side effects (all wrapped so a downstream failure here cannot
    re-raise and mask the original exception):

    1. ``log.exception`` with full traceback + classification + agent.
    2. :func:`capture_exception` to Sentry with ``run_id``, ``agent``,
       ``error_class``, ``classification`` tags.
    3. ``await mark_failed(run_id)`` so the DB row reflects reality.
    4. ``await emit(run_id, {phase: failed, ...})`` so the UI's SSE
       stream shows a real failure card.

    Parameters
    ----------
    classification:
        Override the structural classification (used by the runner's
        per-agent blocks where the agent-specific exception is already
        known to be "validation" or "ungrounded").
    """
    klass = classification or classify_agent_error(exc)
    note = ERROR_NOTES.get(klass, ERROR_NOTES["unexpected"])

    # 1. Log with traceback. structlog's exception logger picks up
    #    sys.exc_info() automatically when called from inside an
    #    `except` block, so we don't need to pass exc_info explicitly.
    log.exception(
        "agent.failed",
        run_id=run_id,
        agent=agent,
        classification=klass,
        error=str(exc),
        error_class=type(exc).__name__,
    )

    # 2. Sentry. Imported locally so unit tests don't need the SDK.
    try:
        from tessar.observability import capture_exception

        capture_exception(
            exc,
            run_id=run_id,
            agent=agent,
            classification=klass,
            error_class=type(exc).__name__,
        )
    except Exception:  # pragma: no cover — observability must not crash the run
        log.warning("agent.sentry_capture_failed", run_id=run_id, agent=agent, exc_info=True)

    # 3. Mark the row failed. Best-effort: if the DB is also down we
    #    log and continue so we still emit the SSE event below.
    try:
        await mark_failed(run_id)
    except Exception:  # pragma: no cover — degenerate but recoverable
        log.error("agent.mark_failed_failed", run_id=run_id, agent=agent, exc_info=True)

    # 4. Emit the phase failed event. Same fail-soft posture: a missing
    #    Redis stream entry just means the UI won't show the card live;
    #    Postgres still has the durable copy via the emit fn.
    try:
        await emit(
            run_id,
            {
                "kind": "phase",
                "t": phase_event_t,
                "payload": {
                    "phase": agent,
                    "status": "failed",
                    "note": note,
                },
            },
        )
    except Exception:  # pragma: no cover
        log.error("agent.emit_failed_event_failed", run_id=run_id, agent=agent, exc_info=True)
