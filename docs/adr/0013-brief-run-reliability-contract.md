# ADR-0013: Brief-run reliability contract

- **Status:** Accepted
- **Date:** 2025-11-22
- **Deciders:** mjadh

## Context

A user-paid run failing is the worst possible outcome for TESSAR: the user is
charged, the user has nothing to show for it, trust is gone. The brief-run
pipeline (`apps/orchestrator/tessar/runner.py`) is a 9-agent sequential
graph; each agent makes one or more LLM calls (Gemini → Claude → OpenAI
fallback) and persists intermediate state to Postgres + Redis. There are
roughly 25 places a single run can fail:

- LLM provider outage / quota exhaustion → `AllProvidersFailed`
- Per-run token-budget breach → `BudgetExceeded`
- Agent validation failure (invalid JSON, ungrounded picks) → agent-specific
  `*Error` (already handled per agent)
- Transient Postgres / Redis / Memorystore blip → `OperationalError` /
  `ConnectionError` / `TimeoutError`
- Lazy provider import failing (missing wheel, broken auth) → `ImportError`
- Cloud Run instance OOM-killed mid-run → Pub/Sub redelivers the message
- The Run row vanishes between enqueue and execution → poison message
- WeasyPrint can't import GTK on dev box → `OSError` (already tolerated)
- Anything else nobody anticipated → bubbles to Pub/Sub → 500 → retry storm

Before this ADR, only one of the 8 agent dispatch blocks (`architect`)
caught `AllProvidersFailed` / `BudgetExceeded`. The other 7 caught only
their own `*Error` subclass, so a provider outage or budget breach
during `synthesizer` (etc.) would propagate to `app.py`, return 500, and
Pub/Sub would redeliver — re-spending LLM budget on every retry until the
delivery attempt cap hit the DLQ. Worse, Sentry only captured the outer
exception in `app.py`, losing the agent context.

The diagnostic that drove this ADR catalogued 23 try/except blocks in
`runner.py` and confirmed the test suite was green — meaning the failures
the user was seeing in production were unhandled runtime exceptions that
the test suite did not exercise.

## Decision

Lock the following reliability contract on the brief-run pipeline:

### 1. Every agent dispatch block MUST catch `Exception`

In `runner.py`, each of the 9 agent dispatch blocks
(`intake_normalizer`, `requirements_extractor`, `research_planner`,
`research_workers`, `synthesizer`, `architect`, `cost_estimator`,
`risk_writer`, `packager`) keeps its existing agent-specific exception
handler (for the rich "produced invalid JSON twice" copy) AND adds a
broad `except Exception as exc:` fallback that funnels through
`tessar.reliability.handle_agent_failure`. The post-packager artifact
upload + finalisation block is treated as a synthetic `finalize` agent
with the same contract.

### 2. One failure funnel: `handle_agent_failure`

A single helper in `tessar/reliability.py` is the only path that turns
an in-run exception into a run-failure outcome. It guarantees:

- `log.exception` with run_id, agent, classification, error_class,
  full traceback.
- Sentry `capture_exception` with the same tags (so the alert email
  knows which agent crashed for which run, without grepping logs).
- The Run row is flipped to `failed` with `completed_at` set.
- An SSE `phase: failed` event is emitted so the UI shows a real
  failure card instead of a forever-spinner.

All four side-effects are individually wrapped — a broken Sentry must
not block the DB flip; a broken DB must not block the SSE event.

### 3. Every DB-touching helper retries transient infra errors

`_load_brief`, `_mark_failed`, `_emit`, and the finalisation commit go
through `tessar.reliability.with_db_retry`. The default allow-list
covers `ConnectionError`, `TimeoutError`, SQLAlchemy `OperationalError`
/ `DBAPIError` / `DisconnectionError`, and Redis equivalents. Non-
transient errors (integrity, schema, auth, validation) raise
immediately with no retries.

Retry policy: 3 attempts, exponential backoff 0.5s → 1.0s → 2.0s with
±25 % jitter, capped at 4 s.

### 4. Crash-recovery refusal

When Pub/Sub redelivers a message whose run row is already `running`
(meaning the previous worker crashed mid-execution), we mark the run
failed and refuse to re-execute. Re-executing automatically would
double-charge the LLM budget and possibly duplicate artifacts. The
user can re-submit the brief.

This is detected via the `deliveryAttempt` field on the Pub/Sub
envelope, threaded through `run(run_id, *, delivery_attempt=...)`.

### 5. Poison-message ack-and-drop

When the Run row vanishes between enqueue and execution, the runner
raises `BriefMissingError`. The push handler in `app.py` catches it
explicitly and returns 2xx so Pub/Sub stops re-delivering the dead
message. Same posture for `CrashRecoveryRefusal`.

### 6. Adding a new agent enforces the contract

A new agent is a contract change. The PR that adds it must:

- Add an agent dispatch block in `runner.py` with the
  `except Exception → handle_agent_failure` fallback.
- Register a structural classification in `reliability.ERROR_NOTES`
  if it doesn't fit the existing buckets.
- Add unit tests proving the catch-all path reaches the funnel.

## Consequences

**Wins:**

- A redelivered Pub/Sub message for a crashed run no longer re-spends
  LLM budget — it marks the run failed and acks.
- Provider outages or budget breaches in any of the 8 LLM agents now
  produce a clean `failed` row and a Sentry alert tagged with the
  agent name and run id, instead of bubbling to a 500-loop.
- Transient Postgres blips no longer fail an in-flight run.
- Every agent failure shows up in the UI as a real failure card.
- The 8 agent dispatch blocks are now near-identical in shape, making
  future changes mechanical.

**Costs / risks:**

- The per-agent `except Exception` is intentionally broad — it can mask
  bugs that the agent-specific `*Error` would have surfaced more
  precisely. Mitigation: the funnel logs the full traceback and
  Sentry captures it, so the loss of precision is only at the
  exception-type layer, not at the diagnostic layer.
- Crash-recovery refusal means a user whose run hits a Cloud Run OOM
  has to manually re-submit. The alternative (auto-retry) was rejected
  as too dangerous for LLM-budget reasons. A future improvement could
  add an explicit "Retry this run" button in the UI that resets the
  row to `pending` and re-enqueues.
- `with_db_retry` adds up to ~4 s of latency to the failure path of a
  DB-down scenario. Acceptable — runs are already 8–15 min and a true
  DB outage is operator-paged anyway.

## Test plan

- `tests/test_reliability.py` — 14 unit tests covering `with_db_retry`,
  `classify_agent_error`, and `handle_agent_failure` (including
  side-effect failure paths). Pure-Python, no DB.
- Existing 188 agent + router tests continue to pass unchanged.
- Manual smoke: trigger a run with a deliberately broken provider key,
  confirm the run reaches `failed`, the SSE stream shows a failed
  phase card, and Sentry receives the exception tagged with
  `agent=<name>` and `run_id=<id>`.

## References

- [reliability.py](../../apps/orchestrator/tessar/reliability.py)
- [runner.py](../../apps/orchestrator/tessar/runner.py)
- [app.py](../../apps/orchestrator/tessar/app.py)
- ADR-0010 (observability)
- ADR-0007 (ORM split)
