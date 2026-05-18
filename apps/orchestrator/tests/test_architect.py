"""Tests for the `architect` agent.

Mirrors `test_synthesizer.py`. Hermetic via `MockLlmProvider`.
"""

from __future__ import annotations

import json
from datetime import UTC, date, datetime

import pytest
from pydantic import ValidationError

from tessar.agents.architect import (
    ArchitectureError,
    _admissibility_errors,
    _split_system_user,
    architect,
)
from tessar.kb import KbRecord
from tessar.llm import BudgetTracker, LlmRouter, Tier
from tessar.llm.providers.mock import MockLlmProvider
from tessar.llm.types import LlmMessage
from tessar.schemas import (
    Architecture,
    NormalizedBrief,
    Requirements,
    ResearchFindings,
    Synthesis,
)

# ─── helpers ────────────────────────────────────────────────────


def _normalized() -> NormalizedBrief:
    return NormalizedBrief.model_validate(
        {
            "summary": "B2B CRM aimed at small sales teams.",
            "domain": "b2b",
            "scale": "growing",
            "region": "eu",
            "cloud": "gcp",
            "compliance": ["soc2"],
            "latency": "standard",
            "budget": "standard",
            "key_constraints": ["EU data residency"],
            "provenance": {
                "domain": "brief",
                "scale": "default",
                "region": "brief",
                "cloud": "brief",
                "compliance": "brief",
                "latency": "default",
                "budget": "default",
            },
        }
    )


def _requirements() -> Requirements:
    return Requirements.model_validate(
        {
            "functional": [
                {
                    "id": "FR-01",
                    "title": "Capture leads",
                    "description": "Sales reps capture form submissions.",
                    "priority": "must",
                }
            ],
            "non_functional": [
                {
                    "id": "NFR-01",
                    "category": "performance",
                    "statement": "Page interactions feel instant.",
                    "target": "p95 < 200ms",
                }
            ],
            "personas": ["Sales rep"],
            "out_of_scope": [],
            "assumptions": [],
            "open_questions": [],
        }
    )


def _synthesis() -> Synthesis:
    return Synthesis.model_validate(
        {
            "decisions": [
                {
                    "id": "D-01",
                    "topic": "Compute runtime",
                    "pick": "Cloud Run",
                    "component_id": "gcp.cloud-run",
                    "rationale": "GCP brief; scale to zero; SOC-2 eligible.",
                    "alternatives": [],
                    "confidence": "high",
                    "citations": [{"kind": "kb", "ref": "gcp.cloud-run"}],
                },
                {
                    "id": "D-02",
                    "topic": "Primary database",
                    "pick": "Cloud SQL Postgres + pgvector",
                    "component_id": "gcp.cloud-sql-postgres",
                    "rationale": "Relational + vector at MVP scale.",
                    "alternatives": [],
                    "confidence": "high",
                    "citations": [
                        {"kind": "kb", "ref": "gcp.cloud-sql-postgres"},
                        {"kind": "finding", "ref": "RQ-01"},
                    ],
                },
            ],
            "notes": None,
        }
    )


def _findings() -> ResearchFindings:
    return ResearchFindings.model_validate(
        {
            "findings": [
                {
                    "question_id": "RQ-01",
                    "summary": (
                        "Cloud SQL Postgres with pgvector handles 50k rows of "
                        "embeddings at sub-100ms p95 with HNSW indexes."
                    ),
                    "key_points": [
                        {
                            "statement": "HNSW p95 < 100ms at 50k rows.",
                            "cites": [1],
                        }
                    ],
                    "citations": [
                        {
                            "url": "https://example.com/pgvector",
                            "title": "pgvector benchmarks",
                            "snippet": "HNSW p95 < 100ms.",
                            "publisher": "example.com",
                            "retrieved_at": datetime(2026, 5, 13, tzinfo=UTC),
                            "published_at": None,
                        }
                    ],
                    "confidence": "high",
                    "open_questions": [],
                }
            ],
            "errors": [],
        }
    )


def _kb() -> list[KbRecord]:
    return [
        KbRecord.model_validate(
            {
                "id": "gcp.cloud-run",
                "name": "Cloud Run",
                "category": "compute.serverless-containers",
                "vendor": "google",
                "cloud": "gcp",
                "pricing_model": "per-request",
                "regions": ["europe-west1"],
                "compliance": ["SOC2"],
                "capabilities": ["http-server"],
                "alternatives": [],
                "sources": [
                    {
                        "url": "https://cloud.google.com/run",
                        "title": "Cloud Run",
                        "snapshot_date": date(2026, 5, 11),
                    }
                ],
                "last_verified_at": date(2026, 5, 11),
            }
        ),
        KbRecord.model_validate(
            {
                "id": "gcp.cloud-sql-postgres",
                "name": "Cloud SQL for Postgres",
                "category": "data.relational",
                "vendor": "google",
                "cloud": "gcp",
                "pricing_model": "per-vCPU-hour",
                "regions": ["europe-west1"],
                "compliance": ["SOC2"],
                "capabilities": ["postgres-16", "pgvector"],
                "alternatives": [],
                "sources": [
                    {
                        "url": "https://cloud.google.com/sql",
                        "title": "Cloud SQL",
                        "snapshot_date": date(2026, 5, 11),
                    }
                ],
                "last_verified_at": date(2026, 5, 11),
            }
        ),
    ]


def _scale_triplet(suffix: str = "node") -> list[dict]:
    return [
        {"tier": "1×", "note": f"single instance handles MVP load · {suffix}"},
        {"tier": "10×", "note": f"horizontally scaled to 3-5 instances · {suffix}"},
        {"tier": "100×", "note": f"shard or move to managed alternative · {suffix}"},
    ]


def _good_payload() -> dict[str, object]:
    return {
        "nodes": [
            {
                "id": "N-01",
                "label": "Browser",
                "sub": "Next.js client",
                "zone": "client",
                "icon": "browser",
                "cite": {"kind": "kb", "ref": "gcp.cloud-run"},
                "data_class": "internal",
                "failure_domain": [],
                "why": (
                    "End-user entry point; renders the React UI and opens "
                    "the SSE stream for live progress."
                ),
                "scale": _scale_triplet("browser"),
                "alts": "",
                "scale_chip": None,
                "x": 10.0,
                "y": 50.0,
                "w": 18.0,
            },
            {
                "id": "N-02",
                "label": "Cloud Run (web)",
                "sub": "Next.js 15 · API + UI",
                "zone": "app",
                "icon": "container",
                "cite": {"kind": "kb", "ref": "gcp.cloud-run"},
                "data_class": "confidential",
                "failure_domain": ["N-01"],
                "why": (
                    "Hosts the Next.js app behind the LB. Picked per the "
                    "synthesizer decision; scales to zero off-hours."
                ),
                "scale": _scale_triplet("web"),
                "alts": "GKE Autopilot",
                "scale_chip": "min=1",
                "x": 50.0,
                "y": 30.0,
                "w": 18.0,
            },
            {
                "id": "N-03",
                "label": "Cloud SQL Postgres",
                "sub": "Postgres 16 + pgvector",
                "zone": "data",
                "icon": "database",
                "cite": {"kind": "finding", "ref": "RQ-01"},
                "data_class": "regulated",
                "failure_domain": ["N-02"],
                "why": (
                    "Single store for relational + vector data at MVP "
                    "scale; backed by RQ-01 benchmark."
                ),
                "scale": _scale_triplet("db"),
                "alts": "Spanner; dedicated vector DB",
                "scale_chip": "50k rows",
                "x": 75.0,
                "y": 30.0,
                "w": 18.0,
            },
            {
                "id": "N-04",
                "label": "Stripe",
                "sub": "Checkout + webhooks",
                "zone": "external",
                "icon": "card",
                "cite": {"kind": "kb", "ref": "gcp.cloud-run"},
                "data_class": "regulated",
                "failure_domain": [],
                "why": (
                    "External payment processor; webhook posts back to the "
                    "web service to mark runs paid."
                ),
                "scale": _scale_triplet("stripe"),
                "alts": "",
                "scale_chip": None,
                "x": 92.0,
                "y": 70.0,
                "w": 16.0,
            },
        ],
        "edges": [
            {
                "from": "N-01",
                "to": "N-02",
                "kind": "sync",
                "label": "POST /runs",
                "qps": "5",
                "p95": "120ms",
                "retry": None,
                "payload": "BriefInput",
            },
            {
                "from": "N-02",
                "to": "N-03",
                "kind": "data",
                "label": "read/write run rows",
                "qps": None,
                "p95": "20ms",
                "retry": None,
                "payload": None,
            },
            {
                "from": "N-04",
                "to": "N-02",
                "kind": "external",
                "label": "stripe.session.completed",
                "qps": None,
                "p95": None,
                "retry": "with-backoff",
                "payload": "Webhook",
            },
        ],
        "flows": [
            {
                "id": "F-01",
                "title": "Submit a brief and stream progress",
                "nodes": ["N-01", "N-02", "N-03"],
                "body": (
                    "User submits the brief from the browser; the web "
                    "service writes a Run row and opens an SSE channel "
                    "back to the browser. Progress events stream as the "
                    "orchestrator drives the agent graph."
                ),
            }
        ],
        "diagrams": {
            "c4": (
                "flowchart TD\n"
                "  subgraph Client\n    N1[Browser]\n  end\n"
                "  subgraph App\n    N2[Cloud Run web]\n  end\n"
                "  subgraph Data\n    N3[(Cloud SQL)]\n  end\n"
                "  N1 --> N2\n  N2 -.-> N3"
            ),
            "data_flow": (
                "flowchart LR\n  N1[Browser] --> N2[Cloud Run]\n  N2 -.-> N3[(Cloud SQL)]"
            ),
        },
        "sequence_diagrams": [
            {
                "id": "SEQ-write",
                "kind": "write",
                "title": "Submit a brief",
                "summary": (
                    "User posts a brief from the browser; the web service "
                    "writes a Run row and returns 202."
                ),
                "participants": ["User", "Browser", "Cloud Run (web)", "Cloud SQL Postgres"],
                "mermaid": (
                    "sequenceDiagram\n"
                    "  actor U as User\n"
                    "  participant B as Browser\n"
                    "  participant W as Cloud Run web\n"
                    "  participant DB as Cloud SQL\n"
                    "  U->>B: fill form\n"
                    "  B->>W: POST /runs\n"
                    "  W->>DB: INSERT run\n"
                    "  W-->>B: 202 + runId"
                ),
            },
            {
                "id": "SEQ-read",
                "kind": "read",
                "title": "Stream live progress",
                "summary": (
                    "Browser opens an SSE stream to the web service which "
                    "tails progress events from the database."
                ),
                "participants": ["Browser", "Cloud Run (web)", "Cloud SQL Postgres"],
                "mermaid": (
                    "sequenceDiagram\n"
                    "  participant B as Browser\n"
                    "  participant W as Cloud Run web\n"
                    "  participant DB as Cloud SQL\n"
                    "  B->>W: GET /runs/:id/stream\n"
                    "  loop while running\n"
                    "    W->>DB: SELECT events WHERE id>cursor\n"
                    "    W-->>B: data: event\n"
                    "  end"
                ),
            },
            {
                "id": "SEQ-async",
                "kind": "async",
                "title": "Stripe webhook reconciles a run",
                "summary": (
                    "Stripe posts session.completed; web verifies the "
                    "signature and marks the run paid; retries on failure."
                ),
                "participants": ["Stripe", "Cloud Run (web)", "Cloud SQL Postgres"],
                "mermaid": (
                    "sequenceDiagram\n"
                    "  participant S as Stripe\n"
                    "  participant W as Cloud Run web\n"
                    "  participant DB as Cloud SQL\n"
                    "  S->>W: POST /webhooks/stripe\n"
                    "  W->>DB: UPDATE run SET paid=true\n"
                    "  Note over S,W: 5s timeout, expo backoff, DLQ on exhaust"
                ),
            },
        ],
        "integration_contracts": [
            {
                "edge_id": "N-02->>-N-03",
                "from": "N-02",
                "to": "N-03",
                "mode": "sync",
                "payload": "Postgres SQL via Cloud SQL connector; rows ≤ 64KB.",
                "idempotency": "Receiver upserts by (runId); writes are transactional.",
                "retry": "5s timeout; 1s expo backoff; 3 attempts; surface 5xx on exhaust.",
                "semantics": "exactly-once",
                "cite": {"kind": "kb", "ref": "gcp.cloud-sql-postgres"},
            },
            {
                "edge_id": "N-04->>-N-02",
                "from": "N-04",
                "to": "N-02",
                "mode": "async",
                "payload": "Stripe webhook JSON ≤ 8KB with signature header.",
                "idempotency": "Stripe event-id stored; duplicate posts no-op.",
                "retry": "5s timeout; expo backoff 1s→30s; 5 attempts; DLQ on exhaust.",
                "semantics": "at-least-once",
                "cite": {"kind": "kb", "ref": "gcp.cloud-run"},
            },
        ],
        "component_rationales": [
            {
                "node_id": "N-02",
                "requirement_id": "FR-01",
                "narrative": (
                    "Cloud Run hosts the Next.js capture endpoint that backs "
                    "the lead-capture form. Auto-scales from zero so capture "
                    "stays responsive at low load and absorbs spikes without "
                    "operator intervention."
                ),
                "cite": {"kind": "kb", "ref": "gcp.cloud-run"},
            },
            {
                "node_id": "N-03",
                "requirement_id": "NFR-01",
                "narrative": (
                    "Cloud SQL Postgres with pgvector keeps lead lookups under "
                    "the p95<200ms NFR target at MVP scale per RQ-01's HNSW "
                    "benchmark; managed failover keeps the read path warm."
                ),
                "cite": {"kind": "finding", "ref": "RQ-01"},
            },
            {
                "node_id": "N-04",
                "requirement_id": "FR-01",
                "narrative": (
                    "Stripe Checkout fronts the paid plan that gates lead "
                    "capture beyond the free tier. Webhook reconciliation "
                    "ensures the capture endpoint sees the up-to-date plan."
                ),
                "cite": {"kind": "kb", "ref": "gcp.cloud-run"},
            },
        ],
        "failure_modes": [
            {
                "id": "FM-01",
                "node_id": "N-02",
                "mode": "Cold-start latency spike under bursty traffic",
                "detection": (
                    "Cloud Monitoring alert on revision p95 latency > 2s for "
                    "5 minutes; trace shows cold-start span."
                ),
                "recovery": (
                    "Set min-instances=1 in prod; pre-warm via cron ping; "
                    "long-term move hot path to min-instances=2."
                ),
                "rto": "< 5 min",
                "rpo": "0 (stateless)",
                "cite": {"kind": "kb", "ref": "gcp.cloud-run"},
            },
            {
                "id": "FM-02",
                "node_id": "N-03",
                "mode": "Regional outage of Cloud SQL primary",
                "detection": (
                    "Cloud SQL HA event + connection error spike in worker "
                    "logs; latency_p95 alert fires."
                ),
                "recovery": (
                    "Confirm HA promotion; replay queued writes from DLQ; "
                    "communicate via status page."
                ),
                "rto": "< 90s",
                "rpo": "0 (sync repl)",
                "cite": {"kind": "finding", "ref": "RQ-01"},
            },
        ],
        "build_sequence": [
            {
                "id": "BP-01",
                "label": "Week 1",
                "title": "Stand up the capture path",
                "nodes": ["N-01", "N-02"],
                "rationale": (
                    "Browser + Cloud Run gives the smallest demoable surface "
                    "for the capture form; persistence comes next."
                ),
            },
            {
                "id": "BP-02",
                "label": "Week 2",
                "title": "Persist + show history",
                "nodes": ["N-03"],
                "rationale": (
                    "Add Cloud SQL so captures survive restarts and the "
                    "user can see their lead history."
                ),
            },
            {
                "id": "BP-03",
                "label": "Week 3",
                "title": "Monetize via Stripe",
                "nodes": ["N-04"],
                "rationale": (
                    "Wire Stripe checkout + webhook last so billing rides "
                    "on a stable capture+persist stack."
                ),
            },
        ],
        "notes": None,
    }


def _router(provider: MockLlmProvider) -> LlmRouter:
    return LlmRouter([provider], BudgetTracker(cap_usd=2.0, cap_tokens=400_000))


# ─── happy path ────────────────────────────────────────────────


def test_architect_happy_path() -> None:
    payload = json.dumps(_good_payload())
    p = MockLlmProvider(responder=lambda _msgs, _tier: payload)
    result = architect(
        _normalized(),
        _requirements(),
        _synthesis(),
        _findings(),
        _kb(),
        router=_router(p),
    )
    assert isinstance(result, Architecture)
    assert len(result.nodes) == 4
    assert result.nodes[0].id == "N-01"
    assert result.edges[0].src == "N-01"
    assert result.edges[0].to == "N-02"
    assert "flowchart" in result.diagrams.c4


def test_architect_strips_json_fence() -> None:
    payload = "```json\n" + json.dumps(_good_payload()) + "\n```"
    p = MockLlmProvider(responder=lambda _msgs, _tier: payload)
    result = architect(
        _normalized(),
        _requirements(),
        _synthesis(),
        _findings(),
        _kb(),
        router=_router(p),
    )
    assert len(result.nodes) == 4


def test_architect_uses_tier_a() -> None:
    captured: list[Tier] = []

    def responder(_msgs, tier):
        captured.append(tier)
        return json.dumps(_good_payload())

    p = MockLlmProvider(responder=responder)
    architect(
        _normalized(),
        _requirements(),
        _synthesis(),
        _findings(),
        _kb(),
        router=_router(p),
    )
    assert captured == [Tier.A]


# ─── validation retry ─────────────────────────────────────────


def test_architect_retries_once_on_bad_json() -> None:
    responses = iter(["not json", json.dumps(_good_payload())])
    p = MockLlmProvider(responder=lambda _msgs, _tier: next(responses))
    result = architect(
        _normalized(),
        _requirements(),
        _synthesis(),
        _findings(),
        _kb(),
        router=_router(p),
    )
    assert len(result.nodes) == 4


def test_architect_retries_once_on_validation_error() -> None:
    """First response violates the N-NN id pattern; second is valid."""
    bad = _good_payload()
    nodes = bad["nodes"]
    assert isinstance(nodes, list)
    nodes[0] = {**nodes[0], "id": "not-valid"}  # type: ignore[dict-item]
    responses = iter([json.dumps(bad), json.dumps(_good_payload())])
    p = MockLlmProvider(responder=lambda _msgs, _tier: next(responses))
    result = architect(
        _normalized(),
        _requirements(),
        _synthesis(),
        _findings(),
        _kb(),
        router=_router(p),
    )
    assert result.nodes[0].id == "N-01"


def test_architect_raises_after_three_failures() -> None:
    p = MockLlmProvider(responder=lambda _msgs, _tier: "still not json")
    with pytest.raises(ArchitectureError) as excinfo:
        architect(
            _normalized(),
            _requirements(),
            _synthesis(),
            _findings(),
            _kb(),
            router=_router(p),
        )
    assert excinfo.value.raw_text == "still not json"
    assert excinfo.value.validation_error


# ─── admissibility: citations ─────────────────────────────────


def test_architect_retries_on_unknown_kb_citation() -> None:
    bad = _good_payload()
    nodes = bad["nodes"]
    assert isinstance(nodes, list)
    nodes[0] = {**nodes[0], "cite": {"kind": "kb", "ref": "aws.lambda"}}
    responses = iter([json.dumps(bad), json.dumps(_good_payload())])
    p = MockLlmProvider(responder=lambda _msgs, _tier: next(responses))
    result = architect(
        _normalized(),
        _requirements(),
        _synthesis(),
        _findings(),
        _kb(),
        router=_router(p),
    )
    assert result.nodes[0].cite.ref == "gcp.cloud-run"


def test_architect_retries_on_unknown_finding_citation() -> None:
    bad = _good_payload()
    nodes = bad["nodes"]
    assert isinstance(nodes, list)
    nodes[2] = {**nodes[2], "cite": {"kind": "finding", "ref": "RQ-99"}}
    responses = iter([json.dumps(bad), json.dumps(_good_payload())])
    p = MockLlmProvider(responder=lambda _msgs, _tier: next(responses))
    result = architect(
        _normalized(),
        _requirements(),
        _synthesis(),
        _findings(),
        _kb(),
        router=_router(p),
    )
    assert result.nodes[2].cite.ref == "RQ-01"


# ─── admissibility: topology ──────────────────────────────────


def test_architect_retries_on_dangling_edge() -> None:
    bad = _good_payload()
    edges = bad["edges"]
    assert isinstance(edges, list)
    edges[0] = {**edges[0], "to": "N-99"}
    responses = iter([json.dumps(bad), json.dumps(_good_payload())])
    p = MockLlmProvider(responder=lambda _msgs, _tier: next(responses))
    result = architect(
        _normalized(),
        _requirements(),
        _synthesis(),
        _findings(),
        _kb(),
        router=_router(p),
    )
    assert all(e.to in {n.id for n in result.nodes} for e in result.edges)


def test_architect_retries_on_self_loop() -> None:
    bad = _good_payload()
    edges = bad["edges"]
    assert isinstance(edges, list)
    edges[1] = {**edges[1], "from": "N-03", "to": "N-03"}
    responses = iter([json.dumps(bad), json.dumps(_good_payload())])
    p = MockLlmProvider(responder=lambda _msgs, _tier: next(responses))
    result = architect(
        _normalized(),
        _requirements(),
        _synthesis(),
        _findings(),
        _kb(),
        router=_router(p),
    )
    assert all(e.src != e.to for e in result.edges)


def test_architect_retries_on_dangling_flow_node() -> None:
    bad = _good_payload()
    flows = bad["flows"]
    assert isinstance(flows, list)
    flows[0] = {**flows[0], "nodes": ["N-01", "N-99"]}
    responses = iter([json.dumps(bad), json.dumps(_good_payload())])
    p = MockLlmProvider(responder=lambda _msgs, _tier: next(responses))
    result = architect(
        _normalized(),
        _requirements(),
        _synthesis(),
        _findings(),
        _kb(),
        router=_router(p),
    )
    node_ids = {n.id for n in result.nodes}
    assert all(ref in node_ids for f in result.flows for ref in f.nodes)


def test_architect_raises_after_three_admissibility_failures() -> None:
    bad = _good_payload()
    edges = bad["edges"]
    assert isinstance(edges, list)
    edges[0] = {**edges[0], "to": "N-99"}
    p = MockLlmProvider(responder=lambda _msgs, _tier: json.dumps(bad))
    with pytest.raises(ArchitectureError) as excinfo:
        architect(
            _normalized(),
            _requirements(),
            _synthesis(),
            _findings(),
            _kb(),
            router=_router(p),
        )
    assert "N-99" in excinfo.value.validation_error


def test_admissibility_passes_when_clean() -> None:
    arch = Architecture.model_validate(_good_payload())
    errors = _admissibility_errors(
        arch,
        kb_ids={"gcp.cloud-run", "gcp.cloud-sql-postgres"},
        finding_ids={"RQ-01"},
        requirement_ids={"FR-01", "NFR-01"},
    )
    assert errors == []


def test_admissibility_flags_self_loop_and_dangling_failure_domain() -> None:
    """Direct unit test on the admissibility helper for failure_domain."""
    bad = _good_payload()
    nodes = bad["nodes"]
    assert isinstance(nodes, list)
    nodes[1] = {**nodes[1], "failure_domain": ["N-02", "N-99"]}
    arch = Architecture.model_validate(bad)
    errors = _admissibility_errors(
        arch,
        kb_ids={"gcp.cloud-run", "gcp.cloud-sql-postgres"},
        finding_ids={"RQ-01"},
        requirement_ids={"FR-01", "NFR-01"},
    )
    assert any("itself" in e for e in errors)
    assert any("N-99" in e for e in errors)


# ─── interaction with the router ──────────────────────────────


def test_architect_router_falls_back_on_transient() -> None:
    failing = MockLlmProvider(fail_n_times=1)
    healthy = MockLlmProvider(responder=lambda _msgs, _tier: json.dumps(_good_payload()))
    router = LlmRouter([failing, healthy], BudgetTracker(cap_usd=2.0, cap_tokens=400_000))
    result = architect(
        _normalized(),
        _requirements(),
        _synthesis(),
        _findings(),
        _kb(),
        router=router,
    )
    assert len(result.nodes) == 4


def test_architect_propagates_budget_exceeded() -> None:
    from tessar.llm import BudgetExceeded

    p = MockLlmProvider(responder=lambda _msgs, _tier: json.dumps(_good_payload()))
    tiny = LlmRouter([p], BudgetTracker(cap_usd=0.0001, cap_tokens=400_000))
    with pytest.raises(BudgetExceeded):
        architect(
            _normalized(),
            _requirements(),
            _synthesis(),
            _findings(),
            _kb(),
            router=tiny,
        )


# ─── prompt template plumbing ─────────────────────────────────


def test_split_system_user_substitutes_placeholders() -> None:
    template = (
        "## System\nYou are TESSAR.\n\n"
        "## User\nN: {{NORMALIZED_BRIEF_JSON}} R: {{REQUIREMENTS_JSON}} "
        "S: {{SYNTHESIS_JSON}} F: {{FINDINGS_JSON}} K: {{KB_CANDIDATES_JSON}}"
    )
    msgs = _split_system_user(
        template,
        normalized_json='{"domain":"b2b"}',
        requirements_json='{"functional":[]}',
        synthesis_json='{"decisions":[]}',
        findings_json='{"findings":[]}',
        kb_json='[{"id":"gcp.cloud-run"}]',
    )
    assert len(msgs) == 2
    assert msgs[0].role == "system"
    assert "TESSAR" in msgs[0].content
    assert '"domain":"b2b"' in msgs[1].content
    assert '"decisions":[]' in msgs[1].content
    assert '"findings":[]' in msgs[1].content
    assert '"gcp.cloud-run"' in msgs[1].content


# ─── schema bounds ────────────────────────────────────────────


def test_architecture_rejects_too_few_nodes() -> None:
    bad = _good_payload()
    nodes = bad["nodes"]
    assert isinstance(nodes, list)
    bad["nodes"] = nodes[:3]  # only 3
    with pytest.raises(ValidationError):
        Architecture.model_validate(bad)


def test_arch_node_requires_exactly_three_scale_tiers() -> None:
    bad = _good_payload()
    nodes = bad["nodes"]
    assert isinstance(nodes, list)
    nodes[0] = {**nodes[0], "scale": _scale_triplet()[:2]}  # only 2
    with pytest.raises(ValidationError):
        Architecture.model_validate(bad)


def test_arch_edge_alias_from_serializes_to_from() -> None:
    """`src` field aliases to `"from"` to match the TS contract."""
    payload = _good_payload()
    arch = Architecture.model_validate(payload)
    dumped = json.loads(arch.model_dump_json(by_alias=True))
    assert dumped["edges"][0]["from"] == "N-01"
    assert "src" not in dumped["edges"][0]


# ─── ADR-0006 admissibility ──────────────────────────────────


def _adm_kwargs() -> dict[str, set[str]]:
    return {
        "kb_ids": {"gcp.cloud-run", "gcp.cloud-sql-postgres"},
        "finding_ids": {"RQ-01"},
        "requirement_ids": {"FR-01", "NFR-01"},
    }


def test_admissibility_flags_missing_sequence_kind() -> None:
    bad = _good_payload()
    seqs = bad["sequence_diagrams"]
    assert isinstance(seqs, list)
    bad["sequence_diagrams"] = [s for s in seqs if s["kind"] != "async"]
    arch = Architecture.model_validate(bad)
    errors = _admissibility_errors(arch, **_adm_kwargs())
    assert any("missing required kinds" in e and "async" in e for e in errors)


def test_admissibility_flags_empty_sequence_diagrams() -> None:
    bad = _good_payload()
    bad["sequence_diagrams"] = []
    arch = Architecture.model_validate(bad)
    errors = _admissibility_errors(arch, **_adm_kwargs())
    assert any("sequence_diagrams is empty" in e for e in errors)


def test_admissibility_flags_integration_contract_unknown_edge() -> None:
    bad = _good_payload()
    contracts = bad["integration_contracts"]
    assert isinstance(contracts, list)
    contracts[0] = {**contracts[0], "from": "N-02", "to": "N-04"}  # no such edge
    arch = Architecture.model_validate(bad)
    errors = _admissibility_errors(arch, **_adm_kwargs())
    assert any("does not match any edge" in e for e in errors)


def test_admissibility_flags_integration_contract_unknown_node() -> None:
    bad = _good_payload()
    contracts = bad["integration_contracts"]
    assert isinstance(contracts, list)
    contracts[0] = {**contracts[0], "to": "N-99"}
    arch = Architecture.model_validate(bad)
    errors = _admissibility_errors(arch, **_adm_kwargs())
    assert any("integration_contract[0] to='N-99'" in e for e in errors)


def test_admissibility_flags_integration_contract_ungrounded_cite() -> None:
    bad = _good_payload()
    contracts = bad["integration_contracts"]
    assert isinstance(contracts, list)
    contracts[0] = {**contracts[0], "cite": {"kind": "kb", "ref": "made.up"}}
    arch = Architecture.model_validate(bad)
    errors = _admissibility_errors(arch, **_adm_kwargs())
    assert any("integration_contract[0]" in e and "made.up" in e for e in errors)


def test_admissibility_flags_component_rationale_unknown_node() -> None:
    bad = _good_payload()
    rats = bad["component_rationales"]
    assert isinstance(rats, list)
    rats[0] = {**rats[0], "node_id": "N-99"}
    arch = Architecture.model_validate(bad)
    errors = _admissibility_errors(arch, **_adm_kwargs())
    assert any("component_rationale[0] node_id='N-99'" in e for e in errors)


def test_admissibility_flags_component_rationale_unknown_requirement() -> None:
    bad = _good_payload()
    rats = bad["component_rationales"]
    assert isinstance(rats, list)
    rats[0] = {**rats[0], "requirement_id": "FR-99"}
    arch = Architecture.model_validate(bad)
    errors = _admissibility_errors(arch, **_adm_kwargs())
    assert any("requirement_id='FR-99'" in e for e in errors)


def test_admissibility_flags_empty_component_rationales() -> None:
    bad = _good_payload()
    bad["component_rationales"] = []
    arch = Architecture.model_validate(bad)
    errors = _admissibility_errors(arch, **_adm_kwargs())
    assert any("component_rationales is empty" in e for e in errors)


def test_admissibility_flags_empty_integration_contracts() -> None:
    bad = _good_payload()
    bad["integration_contracts"] = []
    arch = Architecture.model_validate(bad)
    errors = _admissibility_errors(arch, **_adm_kwargs())
    assert any("integration_contracts is empty" in e for e in errors)


def test_admissibility_flags_missing_failure_mode_for_node() -> None:
    bad = _good_payload()
    fms = bad["failure_modes"]
    assert isinstance(fms, list)
    # drop FM-02 (covers N-03 which has failure_domain=[N-02])
    bad["failure_modes"] = [f for f in fms if f["node_id"] != "N-03"]
    arch = Architecture.model_validate(bad)
    errors = _admissibility_errors(arch, **_adm_kwargs())
    assert any("failure_modes missing entries" in e and "N-03" in e for e in errors)


def test_admissibility_flags_failure_mode_unknown_node() -> None:
    bad = _good_payload()
    fms = bad["failure_modes"]
    assert isinstance(fms, list)
    fms[0] = {**fms[0], "node_id": "N-99"}
    arch = Architecture.model_validate(bad)
    errors = _admissibility_errors(arch, **_adm_kwargs())
    assert any("failure_modes[0] node_id='N-99'" in e for e in errors)


def test_admissibility_flags_too_few_build_phases() -> None:
    bad = _good_payload()
    phases = bad["build_sequence"]
    assert isinstance(phases, list)
    bad["build_sequence"] = phases[:2]  # only 2
    arch = Architecture.model_validate(bad)
    errors = _admissibility_errors(arch, **_adm_kwargs())
    assert any("ADR-0006 requires \u22653" in e for e in errors)


def test_admissibility_flags_build_phase_unknown_node() -> None:
    bad = _good_payload()
    phases = bad["build_sequence"]
    assert isinstance(phases, list)
    phases[0] = {**phases[0], "nodes": ["N-01", "N-99"]}
    arch = Architecture.model_validate(bad)
    errors = _admissibility_errors(arch, **_adm_kwargs())
    assert any("build_sequence[0] node='N-99'" in e for e in errors)


# ─── 3-attempt retry (regression for repeated architect failures) ─────────


def test_architect_succeeds_on_third_attempt() -> None:
    """Two consecutive admissibility failures followed by a good payload
    must NOT raise — the architect now has three attempts, not two.

    Regression test for the prod failure mode where the model repeated
    the same failure_modes-coverage mistake across both retries because
    the retry directive didn't enumerate the failure_modes rule.
    """
    bad = _good_payload()
    edges = bad["edges"]
    assert isinstance(edges, list)
    edges[0] = {**edges[0], "to": "N-99"}  # dangling edge → admissibility fails
    responses = iter([json.dumps(bad), json.dumps(bad), json.dumps(_good_payload())])
    p = MockLlmProvider(responder=lambda _msgs, _tier: next(responses))
    result = architect(
        _normalized(),
        _requirements(),
        _synthesis(),
        _findings(),
        _kb(),
        router=_router(p),
    )
    # Third attempt's clean payload was accepted.
    assert all(e.to in {n.id for n in result.nodes} for e in result.edges)


def test_architect_retry_directive_includes_full_admissibility_checklist() -> None:
    """The retry user message must enumerate ALL ADR-0006 admissibility
    rule classes, not just citation+edge. Models tend to under-correct
    when only the rule classes they're reminded about are reinforced.

    Regression for the prod failure where the retry directive only
    mentioned cite/edge/self-loop and the model repeated a
    failure_modes-coverage mistake.
    """
    bad = _good_payload()
    edges = bad["edges"]
    assert isinstance(edges, list)
    edges[0] = {**edges[0], "to": "N-99"}

    seen_messages: list[list[LlmMessage]] = []

    def _responder(msgs, _tier):  # type: ignore[no-untyped-def]
        seen_messages.append(list(msgs))
        # Two bad responses to force the 3rd attempt, then a clean one
        # so the test doesn't raise on irrelevant grounds.
        if len(seen_messages) < 3:
            return json.dumps(bad)
        return json.dumps(_good_payload())

    p = MockLlmProvider(responder=_responder)
    architect(
        _normalized(),
        _requirements(),
        _synthesis(),
        _findings(),
        _kb(),
        router=_router(p),
    )

    # Inspect the retry user turn appended for attempt 2 (last message).
    attempt2_msgs = seen_messages[1]
    last = attempt2_msgs[-1]
    retry_text = getattr(last, "content", "")
    assert "failure_modes" in retry_text, (
        "retry directive must reinforce the failure_modes coverage rule"
    )
    assert "component_rationales" in retry_text
    assert "integration_contract" in retry_text
    assert "build_sequence" in retry_text
    assert "sequence_diagrams" in retry_text
    # Attempt 2 is NOT the final attempt — should not carry FINAL framing.
    assert "FINAL ATTEMPT" not in retry_text

    # Inspect the retry user turn appended for attempt 3 (final).
    attempt3_msgs = seen_messages[2]
    final_text = getattr(attempt3_msgs[-1], "content", "")
    assert "FINAL ATTEMPT" in final_text
    assert "Self-consistency outranks completeness" in final_text


def test_architect_third_attempt_uses_lower_temperature() -> None:
    """The 3rd attempt should drop temperature to 0.1 for determinism."""
    bad = _good_payload()
    edges = bad["edges"]
    assert isinstance(edges, list)
    edges[0] = {**edges[0], "to": "N-99"}

    temps_seen: list[float] = []
    call_count = {"n": 0}

    def _responder(_msgs, _tier):  # type: ignore[no-untyped-def]
        call_count["n"] += 1
        # First two attempts return bad; third returns good.
        if call_count["n"] <= 2:
            return json.dumps(bad)
        return json.dumps(_good_payload())

    p = MockLlmProvider(responder=_responder)
    # Wrap the router's generate to capture temperature.
    router = _router(p)
    original_generate = router.generate

    def _capturing_generate(*args, **kwargs):  # type: ignore[no-untyped-def]
        temp = kwargs.get("temperature")
        temps_seen.append(float(temp) if temp is not None else -1.0)
        return original_generate(*args, **kwargs)

    router.generate = _capturing_generate  # type: ignore[method-assign]
    architect(
        _normalized(),
        _requirements(),
        _synthesis(),
        _findings(),
        _kb(),
        router=router,
    )
    assert len(temps_seen) == 3
    assert temps_seen[0] == 0.2
    assert temps_seen[1] == 0.2
    assert temps_seen[2] == 0.1, "final attempt must use temperature=0.1"
