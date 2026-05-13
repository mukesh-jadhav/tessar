"""Tests for the `cost_estimator` agent."""

from __future__ import annotations

import json
from datetime import UTC, date, datetime

import pytest
from pydantic import ValidationError

from tessar.agents.cost_estimator import (
    CostEstimationError,
    _admissibility_errors,
    _split_system_user,
    estimate,
)
from tessar.kb import KbRecord
from tessar.llm import BudgetTracker, LlmRouter, Tier
from tessar.llm.providers.mock import MockLlmProvider
from tessar.schemas import (
    CostEstimate,
    NormalizedBrief,
    ResearchFindings,
    Synthesis,
)

# ─── helpers (parallel to test_synthesizer / test_architect) ───


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
            "key_constraints": [],
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


def _good_payload() -> dict[str, object]:
    return {
        "currency": "USD",
        "lines": [
            {
                "id": "B-01",
                "name": "Cloud Run (web)",
                "kind": "compute",
                "base_cost_usd": 75.0,
                "scale_exp": {"users": 0.0, "rps": 1.0, "gb": 0.0},
                "fixed": False,
                "free_tier_pct": None,
                "cite": {"kind": "kb", "ref": "gcp.cloud-run"},
                "component_id": "gcp.cloud-run",
                "assumptions": (
                    "1 vCPU / 512MiB, min=1, avg ~6 RPS at growing scale; "
                    "KB baseline assumed 5 RPS so 1.25× applied."
                ),
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
                "assumptions": (
                    "db-custom-1-4096 + 100GB SSD; HA disabled at MVP per RQ-01 finding."
                ),
            },
        ],
        "monthly_baseline_usd": 215.0,
        "monthly_at_10x_usd": 1450.0,
        "monthly_at_100x_usd": 9800.0,
        "notes": None,
    }


def _router(provider: MockLlmProvider) -> LlmRouter:
    return LlmRouter([provider], BudgetTracker(cap_usd=2.0, cap_tokens=400_000))


# ─── happy path ────────────────────────────────────────────────


def test_estimate_happy_path() -> None:
    payload = json.dumps(_good_payload())
    p = MockLlmProvider(responder=lambda _msgs, _tier: payload)
    result = estimate(_normalized(), _synthesis(), _findings(), _kb(), router=_router(p))
    assert isinstance(result, CostEstimate)
    assert len(result.lines) == 2
    assert result.lines[0].kind == "compute"
    assert result.monthly_baseline_usd == pytest.approx(215.0)


def test_estimate_strips_json_fence() -> None:
    payload = "```json\n" + json.dumps(_good_payload()) + "\n```"
    p = MockLlmProvider(responder=lambda _msgs, _tier: payload)
    result = estimate(_normalized(), _synthesis(), _findings(), _kb(), router=_router(p))
    assert len(result.lines) == 2


def test_estimate_uses_tier_b() -> None:
    captured: list[Tier] = []

    def responder(_msgs, tier):
        captured.append(tier)
        return json.dumps(_good_payload())

    p = MockLlmProvider(responder=responder)
    estimate(_normalized(), _synthesis(), _findings(), _kb(), router=_router(p))
    assert captured == [Tier.B]


# ─── validation retry ─────────────────────────────────────────


def test_estimate_retries_once_on_bad_json() -> None:
    responses = iter(["not json", json.dumps(_good_payload())])
    p = MockLlmProvider(responder=lambda _msgs, _tier: next(responses))
    result = estimate(_normalized(), _synthesis(), _findings(), _kb(), router=_router(p))
    assert len(result.lines) == 2


def test_estimate_retries_once_on_validation_error() -> None:
    bad = _good_payload()
    lines = bad["lines"]
    assert isinstance(lines, list)
    lines[0] = {**lines[0], "id": "not-valid"}
    responses = iter([json.dumps(bad), json.dumps(_good_payload())])
    p = MockLlmProvider(responder=lambda _msgs, _tier: next(responses))
    result = estimate(_normalized(), _synthesis(), _findings(), _kb(), router=_router(p))
    assert result.lines[0].id == "B-01"


def test_estimate_raises_after_two_failures() -> None:
    p = MockLlmProvider(responder=lambda _msgs, _tier: "still not json")
    with pytest.raises(CostEstimationError) as excinfo:
        estimate(_normalized(), _synthesis(), _findings(), _kb(), router=_router(p))
    assert excinfo.value.raw_text == "still not json"
    assert excinfo.value.validation_error


# ─── admissibility ────────────────────────────────────────────


def test_estimate_retries_on_unknown_kb_citation() -> None:
    bad = _good_payload()
    lines = bad["lines"]
    assert isinstance(lines, list)
    lines[0] = {**lines[0], "cite": {"kind": "kb", "ref": "aws.lambda"}}
    responses = iter([json.dumps(bad), json.dumps(_good_payload())])
    p = MockLlmProvider(responder=lambda _msgs, _tier: next(responses))
    result = estimate(_normalized(), _synthesis(), _findings(), _kb(), router=_router(p))
    assert result.lines[0].cite.ref == "gcp.cloud-run"


def test_estimate_retries_on_unknown_finding_citation() -> None:
    bad = _good_payload()
    lines = bad["lines"]
    assert isinstance(lines, list)
    lines[1] = {**lines[1], "cite": {"kind": "finding", "ref": "RQ-99"}}
    responses = iter([json.dumps(bad), json.dumps(_good_payload())])
    p = MockLlmProvider(responder=lambda _msgs, _tier: next(responses))
    result = estimate(_normalized(), _synthesis(), _findings(), _kb(), router=_router(p))
    assert result.lines[1].cite.ref == "RQ-01"


def test_estimate_retries_on_kb_cost_out_of_band() -> None:
    """Pricing Cloud Run at $5000/mo when KB baseline is $60 is rejected."""
    bad = _good_payload()
    lines = bad["lines"]
    assert isinstance(lines, list)
    lines[0] = {**lines[0], "base_cost_usd": 5000.0}
    bad["monthly_baseline_usd"] = 5140.0
    bad["monthly_at_10x_usd"] = 9000.0  # still > baseline
    bad["monthly_at_100x_usd"] = 9800.0  # still monotonic
    responses = iter([json.dumps(bad), json.dumps(_good_payload())])
    p = MockLlmProvider(responder=lambda _msgs, _tier: next(responses))
    result = estimate(_normalized(), _synthesis(), _findings(), _kb(), router=_router(p))
    assert result.lines[0].base_cost_usd == pytest.approx(75.0)


def test_estimate_retries_on_rollup_inversion() -> None:
    bad = _good_payload()
    bad["monthly_at_100x_usd"] = 100.0  # less than 10x and baseline
    responses = iter([json.dumps(bad), json.dumps(_good_payload())])
    p = MockLlmProvider(responder=lambda _msgs, _tier: next(responses))
    result = estimate(_normalized(), _synthesis(), _findings(), _kb(), router=_router(p))
    assert result.monthly_at_100x_usd >= result.monthly_at_10x_usd


def test_estimate_raises_after_two_admissibility_failures() -> None:
    bad = _good_payload()
    bad["monthly_at_10x_usd"] = 10.0  # < baseline (215)
    p = MockLlmProvider(responder=lambda _msgs, _tier: json.dumps(bad))
    with pytest.raises(CostEstimationError) as excinfo:
        estimate(_normalized(), _synthesis(), _findings(), _kb(), router=_router(p))
    assert "10x" in excinfo.value.validation_error or "10×" in excinfo.value.validation_error


def test_admissibility_passes_when_clean() -> None:
    est = CostEstimate.model_validate(_good_payload())
    kb_records = {r.id: r for r in _kb()}
    errors = _admissibility_errors(est, kb_records=kb_records, finding_ids={"RQ-01"})
    assert errors == []


def test_admissibility_skips_band_check_when_kb_has_no_baseline() -> None:
    """KB record without a baseline cost can be priced freely (only
    bound by `assumptions`)."""
    kb_no_cost = _kb()
    # rebuild with baseline cleared
    raw = kb_no_cost[0].model_dump()
    raw["baseline_cost_usd_per_month"] = None
    kb_no_cost[0] = KbRecord.model_validate(raw)
    bad = _good_payload()
    lines = bad["lines"]
    assert isinstance(lines, list)
    lines[0] = {**lines[0], "base_cost_usd": 5000.0}
    # keep totals monotonic
    bad["monthly_baseline_usd"] = 5140.0
    bad["monthly_at_10x_usd"] = 9000.0
    bad["monthly_at_100x_usd"] = 50000.0
    est = CostEstimate.model_validate(bad)
    kb_records = {r.id: r for r in kb_no_cost}
    errors = _admissibility_errors(est, kb_records=kb_records, finding_ids={"RQ-01"})
    assert errors == []


# ─── interaction with the router ──────────────────────────────


def test_estimate_router_falls_back_on_transient() -> None:
    failing = MockLlmProvider(fail_n_times=1)
    healthy = MockLlmProvider(responder=lambda _msgs, _tier: json.dumps(_good_payload()))
    router = LlmRouter([failing, healthy], BudgetTracker(cap_usd=2.0, cap_tokens=400_000))
    result = estimate(_normalized(), _synthesis(), _findings(), _kb(), router=router)
    assert len(result.lines) == 2


def test_estimate_propagates_budget_exceeded() -> None:
    from tessar.llm import BudgetExceeded

    p = MockLlmProvider(responder=lambda _msgs, _tier: json.dumps(_good_payload()))
    tiny = LlmRouter([p], BudgetTracker(cap_usd=0.0001, cap_tokens=400_000))
    with pytest.raises(BudgetExceeded):
        estimate(_normalized(), _synthesis(), _findings(), _kb(), router=tiny)


# ─── prompt template plumbing ─────────────────────────────────


def test_split_system_user_substitutes_placeholders() -> None:
    template = (
        "## System\nYou are TESSAR.\n\n"
        "## User\nN: {{NORMALIZED_BRIEF_JSON}} S: {{SYNTHESIS_JSON}} "
        "F: {{FINDINGS_JSON}} K: {{KB_CANDIDATES_JSON}}"
    )
    msgs = _split_system_user(
        template,
        normalized_json='{"domain":"b2b"}',
        synthesis_json='{"decisions":[]}',
        findings_json='{"findings":[]}',
        kb_json='[{"id":"gcp.cloud-run"}]',
    )
    assert len(msgs) == 2
    assert "TESSAR" in msgs[0].content
    assert '"domain":"b2b"' in msgs[1].content
    assert '"gcp.cloud-run"' in msgs[1].content


# ─── schema bounds ────────────────────────────────────────────


def test_cost_estimate_rejects_zero_lines() -> None:
    bad = _good_payload()
    bad["lines"] = []
    with pytest.raises(ValidationError):
        CostEstimate.model_validate(bad)


def test_bom_line_rejects_assumptions_too_short() -> None:
    bad = _good_payload()
    lines = bad["lines"]
    assert isinstance(lines, list)
    lines[0] = {**lines[0], "assumptions": "too short"}
    with pytest.raises(ValidationError):
        CostEstimate.model_validate(bad)


def test_bom_scale_exponent_caps_at_5() -> None:
    bad = _good_payload()
    lines = bad["lines"]
    assert isinstance(lines, list)
    lines[0] = {**lines[0], "scale_exp": {"users": 0.0, "rps": 99.0, "gb": 0.0}}
    with pytest.raises(ValidationError):
        CostEstimate.model_validate(bad)
