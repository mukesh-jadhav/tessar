"""Tests for the `risk_writer` agent."""

from __future__ import annotations

import json
from datetime import UTC, date, datetime

import pytest
from pydantic import ValidationError

from tessar.agents.risk_writer import (
    RiskWritingError,
    _admissibility_errors,
    _component_id_index,
    _split_system_user,
    write_risks,
)
from tessar.kb import KbRecord
from tessar.llm import BudgetTracker, LlmRouter, Tier
from tessar.llm.providers.mock import MockLlmProvider
from tessar.schemas import (
    Architecture,
    CostEstimate,
    NormalizedBrief,
    Requirements,
    ResearchFindings,
    Risks,
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
                    "category": "security",
                    "statement": "PII is encrypted at rest.",
                    "target": "AES-256",
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
                    "summary": "pgvector on Cloud SQL handles 50k embeddings.",
                    "key_points": [{"statement": "HNSW p95 < 100ms at 50k rows.", "cites": [1]}],
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
                "baseline_cost_usd_per_month": 60.0,
                "baseline_cost_assumptions": "1 vCPU, 512MiB, 5 RPS avg.",
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
                "baseline_cost_usd_per_month": 120.0,
                "baseline_cost_assumptions": "db-custom-1-4096, 100GB SSD.",
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


def _architecture() -> Architecture:
    return Architecture.model_validate(
        {
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
                    "why": "End-user entry point; renders the React UI.",
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
                    "why": "Hosts the Next.js app; scales to zero.",
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
                    "why": "Single store for relational + vector data.",
                    "scale": _scale_triplet("db"),
                    "alts": "Spanner",
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
                    "why": "External payment processor.",
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
                    "label": "read/write",
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
                    "title": "Submit a brief",
                    "nodes": ["N-01", "N-02", "N-03"],
                    "body": (
                        "User submits the brief; web writes Run row and "
                        "opens SSE; orchestrator drives agent graph."
                    ),
                }
            ],
            "diagrams": {
                "c4": "flowchart TD\n  N1[Browser] --> N2[Cloud Run] --> N3[(DB)]",
                "data_flow": "flowchart LR\n  N1 --> N2 --> N3",
                "sequence": (
                    "sequenceDiagram\n  actor U as User\n  participant W\n  U->>W: POST /runs"
                ),
            },
            "notes": None,
        }
    )


def _cost() -> CostEstimate:
    return CostEstimate.model_validate(
        {
            "currency": "USD",
            "lines": [
                {
                    "id": "B-01",
                    "name": "Cloud Run",
                    "kind": "compute",
                    "base_cost_usd": 75.0,
                    "scale_exp": {"users": 0.0, "rps": 1.0, "gb": 0.0},
                    "fixed": False,
                    "free_tier_pct": None,
                    "cite": {"kind": "kb", "ref": "gcp.cloud-run"},
                    "component_id": "gcp.cloud-run",
                    "assumptions": "1 vCPU / 512MiB, min=1; 1.25× of KB baseline.",
                },
                {
                    "id": "B-02",
                    "name": "Cloud SQL Postgres",
                    "kind": "data",
                    "base_cost_usd": 140.0,
                    "scale_exp": {"users": 0.3, "rps": 0.0, "gb": 1.0},
                    "fixed": False,
                    "free_tier_pct": None,
                    "cite": {"kind": "finding", "ref": "RQ-01"},
                    "component_id": "gcp.cloud-sql-postgres",
                    "assumptions": "db-custom-1-4096 + 100GB SSD; HA disabled at MVP.",
                },
            ],
            "monthly_baseline_usd": 215.0,
            "monthly_at_10x_usd": 1450.0,
            "monthly_at_100x_usd": 9800.0,
            "notes": None,
        }
    )


def _good_payload() -> dict[str, object]:
    return {
        "risks": [
            {
                "id": "R-01",
                "title": "Cloud SQL single-zone outage",
                "category": "reliability",
                "severity": "high",
                "likelihood": "med",
                "body": (
                    "The Cloud SQL Postgres instance is provisioned in a "
                    "single europe-west1 zone with HA disabled at MVP "
                    "(per RQ-01). A zonal outage takes the entire app "
                    "offline until automated failover or backup restore."
                ),
                "mitigation": (
                    "Enable Cloud SQL HA in europe-west1 once monthly "
                    "revenue justifies the ~$120/mo uplift; until then, "
                    "run the documented restore-from-backup drill quarterly."
                ),
                "component_id": "gcp.cloud-sql-postgres",
                "citations": [
                    {"kind": "kb", "ref": "gcp.cloud-sql-postgres"},
                    {"kind": "finding", "ref": "RQ-01"},
                ],
            },
            {
                "id": "R-02",
                "title": "Stripe webhook replay",
                "category": "security",
                "severity": "high",
                "likelihood": "low",
                "body": (
                    "The Stripe → Cloud Run webhook edge marks runs paid; "
                    "without signature verification and idempotency, an "
                    "attacker who replays a captured event could double-"
                    "credit a run or grant a paid run for free."
                ),
                "mitigation": (
                    "Verify the Stripe-Signature header on every webhook "
                    "and persist event id in a unique-indexed table to "
                    "make handlers idempotent."
                ),
                "component_id": "N-02",
                "citations": [{"kind": "kb", "ref": "gcp.cloud-run"}],
            },
            {
                "id": "R-03",
                "title": "Cost blowup at 10× users",
                "category": "cost",
                "severity": "med",
                "likelihood": "med",
                "body": (
                    "Cloud Run scales linearly with RPS so the projected "
                    "10× monthly bill jumps from $215 to $1,450. Without "
                    "a per-project budget alert this would land as a "
                    "surprise invoice."
                ),
                "mitigation": (
                    "Set a Cloud Billing budget alert at $500 and $1,000 "
                    "tiers and gate paid checkouts on a per-day spend cap."
                ),
                "component_id": "gcp.cloud-run",
                "citations": [{"kind": "kb", "ref": "gcp.cloud-run"}],
            },
            {
                "id": "R-04",
                "title": "PII data residency drift",
                "category": "compliance",
                "severity": "high",
                "likelihood": "low",
                "body": (
                    "Brief sets EU data residency + SOC-2. Cloud SQL is "
                    "pinned to europe-west1, but Cloud Run logs and "
                    "Cloud Storage buckets default to multi-region; PII "
                    "in logs can silently leave the region."
                ),
                "mitigation": (
                    "Set Cloud Logging bucket region = europe-west1 and "
                    "configure Org Policy `gcp.resourceLocations` to "
                    "deny non-EU regions before go-live."
                ),
                "component_id": None,
                "citations": [
                    {"kind": "kb", "ref": "gcp.cloud-run"},
                    {"kind": "kb", "ref": "gcp.cloud-sql-postgres"},
                ],
            },
        ],
        "notes": (
            "Trade-off worth re-visiting: HA Cloud SQL adds ~$120/mo and "
            "is currently disabled. If the EU customer base grows past "
            "20 paying accounts, flip HA on and accept the cost."
        ),
    }


def _router(provider: MockLlmProvider) -> LlmRouter:
    return LlmRouter([provider], BudgetTracker(cap_usd=2.0, cap_tokens=400_000))


def _call(provider: MockLlmProvider) -> Risks:
    return write_risks(
        _normalized(),
        _requirements(),
        _synthesis(),
        _architecture(),
        _cost(),
        _findings(),
        _kb(),
        router=_router(provider),
    )


# ─── happy path ────────────────────────────────────────────────


def test_write_risks_happy_path() -> None:
    payload = json.dumps(_good_payload())
    p = MockLlmProvider(responder=lambda _msgs, _tier: payload)
    result = _call(p)
    assert isinstance(result, Risks)
    assert len(result.risks) == 4
    assert result.risks[0].id == "R-01"
    assert result.risks[0].category == "reliability"
    assert result.risks[0].severity == "high"


def test_write_risks_strips_json_fence() -> None:
    payload = "```json\n" + json.dumps(_good_payload()) + "\n```"
    p = MockLlmProvider(responder=lambda _msgs, _tier: payload)
    result = _call(p)
    assert len(result.risks) == 4


def test_write_risks_uses_tier_a() -> None:
    captured: list[Tier] = []

    def responder(_msgs, tier):
        captured.append(tier)
        return json.dumps(_good_payload())

    p = MockLlmProvider(responder=responder)
    _call(p)
    assert captured == [Tier.A]


# ─── validation retry ─────────────────────────────────────────


def test_write_risks_retries_once_on_bad_json() -> None:
    responses = iter(["not json", json.dumps(_good_payload())])
    p = MockLlmProvider(responder=lambda _msgs, _tier: next(responses))
    result = _call(p)
    assert len(result.risks) == 4


def test_write_risks_retries_once_on_validation_error() -> None:
    bad = _good_payload()
    risks = bad["risks"]
    assert isinstance(risks, list)
    risks[0] = {**risks[0], "id": "not-valid"}
    responses = iter([json.dumps(bad), json.dumps(_good_payload())])
    p = MockLlmProvider(responder=lambda _msgs, _tier: next(responses))
    result = _call(p)
    assert result.risks[0].id == "R-01"


def test_write_risks_raises_after_two_failures() -> None:
    p = MockLlmProvider(responder=lambda _msgs, _tier: "still not json")
    with pytest.raises(RiskWritingError) as excinfo:
        _call(p)
    assert excinfo.value.raw_text == "still not json"
    assert excinfo.value.validation_error


# ─── admissibility ────────────────────────────────────────────


def test_write_risks_retries_on_unknown_kb_citation() -> None:
    bad = _good_payload()
    risks = bad["risks"]
    assert isinstance(risks, list)
    risks[0] = {
        **risks[0],
        "citations": [{"kind": "kb", "ref": "aws.lambda"}],
    }
    responses = iter([json.dumps(bad), json.dumps(_good_payload())])
    p = MockLlmProvider(responder=lambda _msgs, _tier: next(responses))
    result = _call(p)
    assert result.risks[0].citations[0].ref == "gcp.cloud-sql-postgres"


def test_write_risks_retries_on_unknown_finding_citation() -> None:
    bad = _good_payload()
    risks = bad["risks"]
    assert isinstance(risks, list)
    risks[0] = {
        **risks[0],
        "citations": [{"kind": "finding", "ref": "RQ-99"}],
    }
    responses = iter([json.dumps(bad), json.dumps(_good_payload())])
    p = MockLlmProvider(responder=lambda _msgs, _tier: next(responses))
    result = _call(p)
    assert result.risks[0].citations[0].kind == "kb"


def test_write_risks_retries_on_dangling_component_id() -> None:
    bad = _good_payload()
    risks = bad["risks"]
    assert isinstance(risks, list)
    risks[0] = {**risks[0], "component_id": "gcp.bigquery"}
    responses = iter([json.dumps(bad), json.dumps(_good_payload())])
    p = MockLlmProvider(responder=lambda _msgs, _tier: next(responses))
    result = _call(p)
    assert result.risks[0].component_id == "gcp.cloud-sql-postgres"


def test_write_risks_accepts_archnode_id_as_component_id() -> None:
    """`Risk.component_id` may reference an `ArchNode.id` (e.g. `N-02`)
    rather than a synthesis Decision.component_id."""
    payload = _good_payload()
    risks = payload["risks"]
    assert isinstance(risks, list)
    # R-02 already uses component_id="N-02" which is an ArchNode id.
    p = MockLlmProvider(responder=lambda _msgs, _tier: json.dumps(payload))
    result = _call(p)
    assert result.risks[1].component_id == "N-02"


def test_write_risks_raises_after_two_admissibility_failures() -> None:
    bad = _good_payload()
    risks = bad["risks"]
    assert isinstance(risks, list)
    risks[0] = {
        **risks[0],
        "citations": [{"kind": "kb", "ref": "aws.lambda"}],
    }
    p = MockLlmProvider(responder=lambda _msgs, _tier: json.dumps(bad))
    with pytest.raises(RiskWritingError) as excinfo:
        _call(p)
    assert "kb:'aws.lambda'" in excinfo.value.validation_error


def test_admissibility_passes_when_clean() -> None:
    risks = Risks.model_validate(_good_payload())
    kb_records = {r.id: r for r in _kb()}
    component_ids = _component_id_index(_synthesis(), _architecture())
    errors = _admissibility_errors(
        risks,
        kb_records=kb_records,
        finding_ids={"RQ-01"},
        component_ids=component_ids,
    )
    assert errors == []


def test_admissibility_allows_null_component_id() -> None:
    """Null `component_id` is valid (cross-cutting risks)."""
    payload = _good_payload()
    risks = payload["risks"]
    assert isinstance(risks, list)
    for r in risks:
        r["component_id"] = None
    obj = Risks.model_validate(payload)
    kb_records = {r.id: r for r in _kb()}
    component_ids = _component_id_index(_synthesis(), _architecture())
    errors = _admissibility_errors(
        obj,
        kb_records=kb_records,
        finding_ids={"RQ-01"},
        component_ids=component_ids,
    )
    assert errors == []


def test_component_id_index_includes_decisions_and_nodes() -> None:
    ids = _component_id_index(_synthesis(), _architecture())
    assert "gcp.cloud-run" in ids
    assert "gcp.cloud-sql-postgres" in ids
    assert "N-01" in ids
    assert "N-04" in ids


# ─── interaction with the router ──────────────────────────────


def test_write_risks_router_falls_back_on_transient() -> None:
    failing = MockLlmProvider(fail_n_times=1)
    healthy = MockLlmProvider(responder=lambda _msgs, _tier: json.dumps(_good_payload()))
    router = LlmRouter([failing, healthy], BudgetTracker(cap_usd=2.0, cap_tokens=400_000))
    result = write_risks(
        _normalized(),
        _requirements(),
        _synthesis(),
        _architecture(),
        _cost(),
        _findings(),
        _kb(),
        router=router,
    )
    assert len(result.risks) == 4


def test_write_risks_propagates_budget_exceeded() -> None:
    from tessar.llm import BudgetExceeded

    p = MockLlmProvider(responder=lambda _msgs, _tier: json.dumps(_good_payload()))
    tiny = LlmRouter([p], BudgetTracker(cap_usd=0.0001, cap_tokens=400_000))
    with pytest.raises(BudgetExceeded):
        write_risks(
            _normalized(),
            _requirements(),
            _synthesis(),
            _architecture(),
            _cost(),
            _findings(),
            _kb(),
            router=tiny,
        )


# ─── prompt template plumbing ─────────────────────────────────


def test_split_system_user_substitutes_all_placeholders() -> None:
    template = (
        "## System\nYou are TESSAR.\n\n"
        "## User\nN: {{NORMALIZED_BRIEF_JSON}} R: {{REQUIREMENTS_JSON}} "
        "S: {{SYNTHESIS_JSON}} A: {{ARCHITECTURE_JSON}} "
        "C: {{COST_JSON}} F: {{FINDINGS_JSON}} K: {{KB_CANDIDATES_JSON}}"
    )
    msgs = _split_system_user(
        template,
        normalized_json='{"domain":"b2b"}',
        requirements_json='{"functional":[]}',
        synthesis_json='{"decisions":[]}',
        architecture_json='{"nodes":[]}',
        cost_json='{"lines":[]}',
        findings_json='{"findings":[]}',
        kb_json='[{"id":"gcp.cloud-run"}]',
    )
    assert len(msgs) == 2
    assert "TESSAR" in msgs[0].content
    assert '"domain":"b2b"' in msgs[1].content
    assert '"gcp.cloud-run"' in msgs[1].content


# ─── schema bounds ────────────────────────────────────────────


def test_risks_rejects_zero_items() -> None:
    bad = _good_payload()
    bad["risks"] = []
    with pytest.raises(ValidationError):
        Risks.model_validate(bad)


def test_risk_rejects_mitigation_too_short() -> None:
    bad = _good_payload()
    risks = bad["risks"]
    assert isinstance(risks, list)
    risks[0] = {**risks[0], "mitigation": "monitor"}
    with pytest.raises(ValidationError):
        Risks.model_validate(bad)


def test_risk_rejects_id_pattern() -> None:
    bad = _good_payload()
    risks = bad["risks"]
    assert isinstance(risks, list)
    risks[0] = {**risks[0], "id": "RISK-1"}
    with pytest.raises(ValidationError):
        Risks.model_validate(bad)


def test_risk_requires_at_least_one_citation() -> None:
    bad = _good_payload()
    risks = bad["risks"]
    assert isinstance(risks, list)
    risks[0] = {**risks[0], "citations": []}
    with pytest.raises(ValidationError):
        Risks.model_validate(bad)
