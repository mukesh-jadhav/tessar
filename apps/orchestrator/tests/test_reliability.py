"""Unit tests for ``tessar.reliability``.

Pure-Python; no DB, no Sentry, no Redis. Each test stubs only the
collaborator under inspection. The goal is to lock the contract that
the runner depends on:

* :func:`with_db_retry` retries the allow-listed transient errors and
  surfaces non-transient ones immediately.
* :func:`handle_agent_failure` always logs, always calls Sentry,
  always marks the run failed, and always emits a phase-failed event
  \u2014 even when one of those side-effects raises.
"""

from __future__ import annotations

from typing import Any

import pytest

from tessar.reliability import (
    ERROR_NOTES,
    TransientInfraError,
    classify_agent_error,
    handle_agent_failure,
    with_db_retry,
)

# ─── with_db_retry ───────────────────────────────────────────────


@pytest.mark.asyncio
async def test_with_db_retry_returns_on_first_success() -> None:
    calls = 0

    async def fn() -> str:
        nonlocal calls
        calls += 1
        return "ok"

    result = await with_db_retry(fn, op="t", max_attempts=3, base_delay_s=0.0)
    assert result == "ok"
    assert calls == 1


@pytest.mark.asyncio
async def test_with_db_retry_retries_transient_then_succeeds() -> None:
    calls = 0

    async def fn() -> str:
        nonlocal calls
        calls += 1
        if calls < 3:
            raise TransientInfraError("blip")
        return "recovered"

    result = await with_db_retry(fn, op="t", max_attempts=5, base_delay_s=0.0)
    assert result == "recovered"
    assert calls == 3


@pytest.mark.asyncio
async def test_with_db_retry_exhausts_and_raises_last() -> None:
    calls = 0

    async def fn() -> None:
        nonlocal calls
        calls += 1
        raise TransientInfraError(f"blip-{calls}")

    with pytest.raises(TransientInfraError, match="blip-3"):
        await with_db_retry(fn, op="t", max_attempts=3, base_delay_s=0.0)
    assert calls == 3


@pytest.mark.asyncio
async def test_with_db_retry_does_not_retry_non_transient() -> None:
    calls = 0

    async def fn() -> None:
        nonlocal calls
        calls += 1
        raise ValueError("permanent")

    with pytest.raises(ValueError):
        await with_db_retry(fn, op="t", max_attempts=5, base_delay_s=0.0)
    assert calls == 1


@pytest.mark.asyncio
async def test_with_db_retry_respects_custom_allow_list() -> None:
    calls = 0

    async def fn() -> str:
        nonlocal calls
        calls += 1
        if calls == 1:
            raise RuntimeError("custom")
        return "ok"

    result = await with_db_retry(
        fn,
        op="t",
        max_attempts=3,
        base_delay_s=0.0,
        retryable=(RuntimeError,),
    )
    assert result == "ok"
    assert calls == 2


@pytest.mark.asyncio
async def test_with_db_retry_treats_connection_error_as_transient() -> None:
    """``ConnectionError`` is in the default allow-list \u2014 see
    :func:`_default_retryable_types`."""
    calls = 0

    async def fn() -> str:
        nonlocal calls
        calls += 1
        if calls == 1:
            raise ConnectionError("reset")
        return "ok"

    result = await with_db_retry(fn, op="t", max_attempts=3, base_delay_s=0.0)
    assert result == "ok"
    assert calls == 2


@pytest.mark.asyncio
async def test_with_db_retry_max_attempts_must_be_at_least_one() -> None:
    async def fn() -> None: ...

    with pytest.raises(ValueError):
        await with_db_retry(fn, op="t", max_attempts=0)


# ─── classify_agent_error ────────────────────────────────────────


def test_classify_budget_exceeded() -> None:
    class BudgetExceeded(Exception):
        pass

    assert classify_agent_error(BudgetExceeded()) == "budget_exceeded"


def test_classify_all_providers_failed() -> None:
    class AllProvidersFailed(Exception):
        pass

    assert classify_agent_error(AllProvidersFailed()) == "providers_failed"


def test_classify_unknown_defaults_to_unexpected() -> None:
    assert classify_agent_error(RuntimeError("boom")) == "unexpected"


# ─── handle_agent_failure ────────────────────────────────────────


@pytest.mark.asyncio
async def test_handle_agent_failure_invokes_all_side_effects(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, Any] = {}

    def fake_capture(exc: BaseException, **tags: str) -> None:
        captured["exc"] = exc
        captured["tags"] = tags

    # Patch the observability module so we don't need a Sentry DSN.
    import tessar.observability as obs

    monkeypatch.setattr(obs, "capture_exception", fake_capture)

    mark_calls: list[str] = []
    emit_calls: list[tuple[str, dict[str, Any]]] = []

    async def mark_failed(run_id: str) -> None:
        mark_calls.append(run_id)

    async def emit(run_id: str, event: dict[str, Any]) -> None:
        emit_calls.append((run_id, event))

    exc = RuntimeError("boom")
    await handle_agent_failure(
        run_id="r1",
        agent="synthesizer",
        exc=exc,
        phase_event_t=4300,
        mark_failed=mark_failed,
        emit=emit,
    )

    assert mark_calls == ["r1"]
    assert len(emit_calls) == 1
    run_id, event = emit_calls[0]
    assert run_id == "r1"
    assert event["kind"] == "phase"
    assert event["t"] == 4300
    assert event["payload"]["phase"] == "synthesizer"
    assert event["payload"]["status"] == "failed"
    assert event["payload"]["note"] == ERROR_NOTES["unexpected"]

    assert captured["exc"] is exc
    assert captured["tags"]["run_id"] == "r1"
    assert captured["tags"]["agent"] == "synthesizer"
    assert captured["tags"]["classification"] == "unexpected"
    assert captured["tags"]["error_class"] == "RuntimeError"


@pytest.mark.asyncio
async def test_handle_agent_failure_uses_classification_override(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import tessar.observability as obs

    monkeypatch.setattr(obs, "capture_exception", lambda *a, **k: None)

    emit_calls: list[dict[str, Any]] = []

    async def mark_failed(run_id: str) -> None: ...

    async def emit(run_id: str, event: dict[str, Any]) -> None:
        emit_calls.append(event)

    await handle_agent_failure(
        run_id="r2",
        agent="architect",
        exc=RuntimeError("anything"),
        phase_event_t=4840,
        mark_failed=mark_failed,
        emit=emit,
        classification="providers_failed",
    )

    assert emit_calls[0]["payload"]["note"] == ERROR_NOTES["providers_failed"]


@pytest.mark.asyncio
async def test_handle_agent_failure_swallows_mark_failed_errors(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Even if mark_failed raises, the SSE event must still be emitted
    so the UI shows a real failure card rather than a forever-spinner."""
    import tessar.observability as obs

    monkeypatch.setattr(obs, "capture_exception", lambda *a, **k: None)

    emit_calls: list[dict[str, Any]] = []

    async def mark_failed(run_id: str) -> None:
        raise RuntimeError("db down too")

    async def emit(run_id: str, event: dict[str, Any]) -> None:
        emit_calls.append(event)

    # Must not raise.
    await handle_agent_failure(
        run_id="r3",
        agent="risk_writer",
        exc=RuntimeError("boom"),
        phase_event_t=5800,
        mark_failed=mark_failed,
        emit=emit,
    )

    assert len(emit_calls) == 1


@pytest.mark.asyncio
async def test_handle_agent_failure_swallows_sentry_errors(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import tessar.observability as obs

    def boom(exc: BaseException, **tags: str) -> None:
        raise RuntimeError("sentry broken")

    monkeypatch.setattr(obs, "capture_exception", boom)

    mark_calls: list[str] = []
    emit_calls: list[dict[str, Any]] = []

    async def mark_failed(run_id: str) -> None:
        mark_calls.append(run_id)

    async def emit(run_id: str, event: dict[str, Any]) -> None:
        emit_calls.append(event)

    await handle_agent_failure(
        run_id="r4",
        agent="cost_estimator",
        exc=RuntimeError("boom"),
        phase_event_t=5280,
        mark_failed=mark_failed,
        emit=emit,
    )

    # Sentry failing must NOT block the recovery path.
    assert mark_calls == ["r4"]
    assert len(emit_calls) == 1
