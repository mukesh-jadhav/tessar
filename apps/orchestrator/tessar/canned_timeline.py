"""Canned timeline for Phase-2 runs.

Mirrors ``apps/web/lib/mocks/recorded-run.ts`` so the worker emits the
same wire-format events the UI already understands. The only differences
vs. the mock recording:

* Timeline is **compressed** (sleeps measured in seconds, not minutes) so
  Phase-2 demos finish in <30 s — Phase 3 will replace this with real
  agent latency.
* The interactive ``clarify`` event is omitted; clarification round-trips
  are a Phase-3 concern (worker has to pause and wait for an answer).
* No "hello" event — the SSE route emits that synthetically on connect.

Locked by ADR-0005: the per-event shape (``kind`` + ``payload``) IS the
contract between the worker and the web SSE consumer. Do not add fields
here without updating ``RecordedEvent`` in the web package.
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any, Literal, TypedDict

# ── Wire-format types ───────────────────────────────────────────────────────

Phase = Literal[
    "intake_normalizer",
    "requirements_extractor",
    "research_planner",
    "research_workers",
    "synthesizer",
    "architect",
    "cost_estimator",
    "risk_writer",
    "packager",
]


class _Event(TypedDict):
    kind: str
    t: int  # ms from run start
    payload: dict[str, Any]


# ── The script ──────────────────────────────────────────────────────────────


def _phase(t: int, phase: Phase, status: str, note: str | None = None) -> _Event:
    payload: dict[str, Any] = {"phase": phase, "status": status}
    if note is not None:
        payload["note"] = note
    return {"kind": "phase", "t": t, "payload": payload}


# Timeline is the same beats as RECORDED_RUN but compressed by ~10x so the
# end-to-end loop completes in well under a minute on local dev.
TIMELINE: tuple[_Event, ...] = (
    _phase(80, "intake_normalizer", "started"),
    {"kind": "metric", "t": 120, "payload": {"tokens": 540, "costUsd": 0.002, "sources": 0}},
    _phase(240, "intake_normalizer", "completed", "Brief normalised · domain = B2B SaaS"),
    _phase(270, "requirements_extractor", "started"),
    {
        "kind": "source",
        "t": 480,
        "payload": {"id": 1, "title": "GDPR data-residency overview", "publisher": "EU Commission"},
    },
    _phase(1100, "requirements_extractor", "completed", "5k MAU · EU residency · 200ms p95"),
    _phase(1120, "research_planner", "started"),
    _phase(1380, "research_planner", "completed", "8 questions to answer"),
    _phase(1400, "research_workers", "started", "8 workers in parallel"),
    {
        "kind": "source",
        "t": 1520,
        "payload": {"id": 2, "title": "Cloud Run pricing & cold-start", "publisher": "GCP Docs"},
    },
    {
        "kind": "source",
        "t": 1610,
        "payload": {
            "id": 3,
            "title": "pgvector benchmarks at 1M rows",
            "publisher": "Supabase Blog",
        },
    },
    {"kind": "metric", "t": 1700, "payload": {"tokens": 18400, "costUsd": 0.064, "sources": 3}},
    {
        "kind": "source",
        "t": 1890,
        "payload": {
            "id": 4,
            "title": "Pub/Sub vs Service Bus latency",
            "publisher": "Cloud Native Now",
        },
    },
    {
        "kind": "source",
        "t": 2150,
        "payload": {"id": 5, "title": "Tavily Search API limits", "publisher": "Tavily Docs"},
    },
    {
        "kind": "source",
        "t": 2480,
        "payload": {
            "id": 6,
            "title": "Memorystore Redis Streams patterns",
            "publisher": "GCP Docs",
        },
    },
    {"kind": "metric", "t": 2700, "payload": {"tokens": 41200, "costUsd": 0.18, "sources": 6}},
    {
        "kind": "source",
        "t": 3020,
        "payload": {"id": 7, "title": "GDPR-compliant LLM routing", "publisher": "HashiCorp Blog"},
    },
    _phase(3300, "research_workers", "completed", "8/8 workers returned"),
    _phase(3320, "synthesizer", "started"),
    {
        "kind": "decision",
        "t": 3540,
        "payload": {
            "id": "d-db",
            "topic": "Primary database",
            "pick": "Cloud SQL Postgres + pgvector",
            "conf": "high",
        },
    },
    {
        "kind": "decision",
        "t": 3780,
        "payload": {
            "id": "d-queue",
            "topic": "Job queue",
            "pick": "Pub/Sub + push subscription",
            "conf": "high",
        },
    },
    {
        "kind": "decision",
        "t": 4020,
        "payload": {
            "id": "d-llm",
            "topic": "LLM router",
            "pick": "Vertex Gemini → Claude → OpenAI fallback",
            "conf": "med",
        },
    },
    _phase(4300, "synthesizer", "completed", "11 components picked · all cited"),
    _phase(4320, "architect", "started"),
    {"kind": "metric", "t": 4500, "payload": {"tokens": 78400, "costUsd": 0.39, "sources": 7}},
    _phase(4840, "architect", "completed", "C4 + data-flow + sequence emitted"),
    _phase(4860, "cost_estimator", "started"),
    _phase(5280, "cost_estimator", "completed", "$184/mo idle · $1,910 at 10×"),
    _phase(5300, "risk_writer", "started"),
    {
        "kind": "decision",
        "t": 5540,
        "payload": {
            "id": "d-cdn",
            "topic": "Edge / WAF",
            "pick": "Cloud Armor + Cloud CDN",
            "conf": "high",
        },
    },
    _phase(5800, "risk_writer", "completed", "6 risks · 4 mitigations"),
    _phase(5820, "packager", "started"),
    {"kind": "metric", "t": 6000, "payload": {"tokens": 96400, "costUsd": 0.51, "sources": 7}},
    _phase(6420, "packager", "completed", "PDF + Markdown rendered"),
)


def iter_with_delays() -> Iterator[tuple[float, _Event]]:
    """Yield (sleep_seconds_before_emit, event) pairs.

    Caller awaits the sleep before publishing the event so the SSE stream
    has visible cadence. Total wall time is the last ``t`` (~6.4 s).
    """
    prev_t = 0
    for ev in TIMELINE:
        delta_ms = max(0, ev["t"] - prev_t)
        yield delta_ms / 1000.0, ev
        prev_t = ev["t"]
