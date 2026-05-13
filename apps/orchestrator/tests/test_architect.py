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
            "sequence": (
                "sequenceDiagram\n  actor U as User\n"
                "  participant W as Cloud Run web\n"
                "  participant DB as Cloud SQL\n"
                "  U->>W: POST /runs\n  W->>DB: INSERT run\n"
                "  W-->>U: SSE stream"
            ),
        },
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


def test_architect_raises_after_two_failures() -> None:
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


def test_architect_raises_after_two_admissibility_failures() -> None:
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
