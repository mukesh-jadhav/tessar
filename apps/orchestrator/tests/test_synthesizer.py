"""Tests for the `synthesizer` agent.

Mirrors `test_research_planner.py`. Hermetic via `MockLlmProvider`.
"""

from __future__ import annotations

import json
from datetime import UTC, date, datetime

import pytest
from pydantic import ValidationError

from tessar.agents.synthesizer import (
    SynthesisError,
    _admissibility_errors,
    _kb_to_prompt_dicts,
    _split_system_user,
    synthesize,
)
from tessar.kb import KbRecord
from tessar.llm import BudgetTracker, LlmRouter, Tier
from tessar.llm.providers.mock import MockLlmProvider
from tessar.schemas import (
    NormalizedBrief,
    Requirements,
    ResearchFindings,
    ResearchPlan,
    Synthesis,
)

# ─── helpers ────────────────────────────────────────────────────


def _normalized() -> NormalizedBrief:
    return NormalizedBrief.model_validate(
        {
            "summary": "B2B CRM aimed at small sales teams with EU residency.",
            "domain": "b2b",
            "scale": "growing",
            "region": "eu",
            "cloud": "gcp",
            "compliance": ["soc2", "gdpr"],
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


def _plan() -> ResearchPlan:
    return ResearchPlan.model_validate(
        {
            "questions": [
                {
                    "id": "RQ-01",
                    "question": "Is Cloud SQL pgvector fast enough for ~50k rows?",
                    "rationale": "A wrong answer wastes money on a vector DB.",
                    "category": "component_choice",
                    "priority": "high",
                    "keywords": ["pgvector", "cloud sql"],
                    "relates_to": ["NFR-01"],
                }
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
                        "Cloud SQL Postgres 16 with pgvector handles ~50k rows of "
                        "768-dim embeddings at sub-100ms p95 with HNSW indexes."
                    ),
                    "key_points": [
                        {
                            "statement": "HNSW indexes give sub-100ms p95 at 50k rows.",
                            "cites": [1],
                        }
                    ],
                    "citations": [
                        {
                            "url": "https://example.com/pgvector-bench",
                            "title": "pgvector benchmarks 2026",
                            "snippet": "HNSW p95 < 100ms at 50k rows.",
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
                "baseline_cost_usd_per_month": 30,
                "regions": ["europe-west1"],
                "compliance": ["SOC2"],
                "capabilities": ["http-server"],
                "alternatives": [
                    {
                        "id": "gcp.gke-autopilot",
                        "why_not_default": "Overkill for a small team.",
                    }
                ],
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
                "baseline_cost_usd_per_month": 90,
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
        "decisions": [
            {
                "id": "D-01",
                "topic": "Compute runtime",
                "pick": "Cloud Run",
                "component_id": "gcp.cloud-run",
                "rationale": (
                    "Brief specifies GCP and a small team; Cloud Run scales to "
                    "zero, fits the standard latency target, and is SOC-2 eligible."
                ),
                "alternatives": [
                    {
                        "name": "GKE Autopilot",
                        "why_not": "Overkill for a small team and adds cluster ops burden.",
                    }
                ],
                "confidence": "high",
                "citations": [{"kind": "kb", "ref": "gcp.cloud-run"}],
            },
            {
                "id": "D-02",
                "topic": "Primary database",
                "pick": "Cloud SQL Postgres 16 + pgvector",
                "component_id": "gcp.cloud-sql-postgres",
                "rationale": (
                    "Single store for relational + vectors at MVP scale; backed "
                    "by a benchmark showing sub-100ms p95 at 50k rows."
                ),
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


def _router(provider: MockLlmProvider) -> LlmRouter:
    return LlmRouter([provider], BudgetTracker(cap_usd=1.0, cap_tokens=200_000))


# ─── happy path ────────────────────────────────────────────────


def test_synthesizer_happy_path() -> None:
    payload = json.dumps(_good_payload())
    p = MockLlmProvider(responder=lambda _msgs, _tier: payload)
    result = synthesize(
        _normalized(), _requirements(), _plan(), _findings(), _kb(), router=_router(p)
    )
    assert isinstance(result, Synthesis)
    assert len(result.decisions) == 2
    assert result.decisions[0].id == "D-01"
    assert result.decisions[1].component_id == "gcp.cloud-sql-postgres"


def test_synthesizer_strips_json_fence() -> None:
    payload = "```json\n" + json.dumps(_good_payload()) + "\n```"
    p = MockLlmProvider(responder=lambda _msgs, _tier: payload)
    result = synthesize(
        _normalized(), _requirements(), _plan(), _findings(), _kb(), router=_router(p)
    )
    assert len(result.decisions) == 2


def test_synthesizer_uses_tier_a() -> None:
    captured: list[Tier] = []

    def responder(_msgs, tier):
        captured.append(tier)
        return json.dumps(_good_payload())

    p = MockLlmProvider(responder=responder)
    synthesize(_normalized(), _requirements(), _plan(), _findings(), _kb(), router=_router(p))
    assert captured == [Tier.A]


# ─── validation retry ─────────────────────────────────────────


def test_synthesizer_retries_once_on_bad_json() -> None:
    responses = iter(["not json", json.dumps(_good_payload())])
    p = MockLlmProvider(responder=lambda _msgs, _tier: next(responses))
    result = synthesize(
        _normalized(), _requirements(), _plan(), _findings(), _kb(), router=_router(p)
    )
    assert len(result.decisions) == 2


def test_synthesizer_retries_once_on_validation_error() -> None:
    """First response violates the D-NN id pattern; second is valid."""
    bad = _good_payload()
    decisions = bad["decisions"]
    assert isinstance(decisions, list)
    decisions[0] = {**decisions[0], "id": "not-valid"}  # type: ignore[dict-item]
    responses = iter([json.dumps(bad), json.dumps(_good_payload())])
    p = MockLlmProvider(responder=lambda _msgs, _tier: next(responses))
    result = synthesize(
        _normalized(), _requirements(), _plan(), _findings(), _kb(), router=_router(p)
    )
    assert result.decisions[0].id == "D-01"


def test_synthesizer_raises_after_two_failures() -> None:
    p = MockLlmProvider(responder=lambda _msgs, _tier: "still not json")
    with pytest.raises(SynthesisError) as excinfo:
        synthesize(
            _normalized(),
            _requirements(),
            _plan(),
            _findings(),
            _kb(),
            router=_router(p),
        )
    assert excinfo.value.raw_text == "still not json"
    assert excinfo.value.validation_error


# ─── citation admissibility ───────────────────────────────────


def test_synthesizer_retries_on_unknown_kb_citation() -> None:
    """First response cites a KB id we never supplied; second is clean."""
    bad = _good_payload()
    decisions = bad["decisions"]
    assert isinstance(decisions, list)
    decisions[0] = {
        **decisions[0],
        "citations": [{"kind": "kb", "ref": "aws.lambda"}],  # not in supplied KB
    }
    responses = iter([json.dumps(bad), json.dumps(_good_payload())])
    p = MockLlmProvider(responder=lambda _msgs, _tier: next(responses))
    result = synthesize(
        _normalized(), _requirements(), _plan(), _findings(), _kb(), router=_router(p)
    )
    assert result.decisions[0].citations[0].ref == "gcp.cloud-run"


def test_synthesizer_retries_on_unknown_finding_citation() -> None:
    """First response cites a RQ-NN that has no finding; second is clean."""
    bad = _good_payload()
    decisions = bad["decisions"]
    assert isinstance(decisions, list)
    decisions[1] = {
        **decisions[1],
        "citations": [{"kind": "finding", "ref": "RQ-99"}],  # no such finding
    }
    responses = iter([json.dumps(bad), json.dumps(_good_payload())])
    p = MockLlmProvider(responder=lambda _msgs, _tier: next(responses))
    result = synthesize(
        _normalized(), _requirements(), _plan(), _findings(), _kb(), router=_router(p)
    )
    assert any(c.ref == "RQ-01" for c in result.decisions[1].citations)


def test_synthesizer_raises_after_two_admissibility_failures() -> None:
    bad = _good_payload()
    decisions = bad["decisions"]
    assert isinstance(decisions, list)
    decisions[0] = {
        **decisions[0],
        "citations": [{"kind": "kb", "ref": "aws.lambda"}],
    }
    p = MockLlmProvider(responder=lambda _msgs, _tier: json.dumps(bad))
    with pytest.raises(SynthesisError) as excinfo:
        synthesize(
            _normalized(),
            _requirements(),
            _plan(),
            _findings(),
            _kb(),
            router=_router(p),
        )
    assert "aws.lambda" in excinfo.value.validation_error


def test_admissibility_errors_passes_when_all_grounded() -> None:
    payload = _good_payload()
    s = Synthesis.model_validate(payload)
    errors = _admissibility_errors(
        s,
        kb_ids={"gcp.cloud-run", "gcp.cloud-sql-postgres"},
        finding_ids={"RQ-01"},
    )
    assert errors == []


def test_admissibility_errors_flags_unknown_refs() -> None:
    payload = _good_payload()
    s = Synthesis.model_validate(payload)
    errors = _admissibility_errors(s, kb_ids=set(), finding_ids=set())
    # 2 kb refs in decisions + 1 finding ref in decisions = 3 unknowns
    assert len(errors) == 3


# ─── interaction with the router ──────────────────────────────


def test_synthesizer_router_falls_back_on_transient() -> None:
    failing = MockLlmProvider(fail_n_times=1)
    healthy = MockLlmProvider(responder=lambda _msgs, _tier: json.dumps(_good_payload()))
    router = LlmRouter([failing, healthy], BudgetTracker(cap_usd=1.0, cap_tokens=200_000))
    result = synthesize(_normalized(), _requirements(), _plan(), _findings(), _kb(), router=router)
    assert len(result.decisions) == 2


def test_synthesizer_propagates_budget_exceeded() -> None:
    from tessar.llm import BudgetExceeded

    p = MockLlmProvider(responder=lambda _msgs, _tier: json.dumps(_good_payload()))
    tiny = LlmRouter([p], BudgetTracker(cap_usd=0.0001, cap_tokens=200_000))
    with pytest.raises(BudgetExceeded):
        synthesize(_normalized(), _requirements(), _plan(), _findings(), _kb(), router=tiny)


# ─── prompt template plumbing ─────────────────────────────────


def test_split_system_user_substitutes_placeholders() -> None:
    template = (
        "## System\nYou are TESSAR.\n\n"
        "## User\nN: {{NORMALIZED_BRIEF_JSON}} R: {{REQUIREMENTS_JSON}} "
        "F: {{FINDINGS_JSON}} K: {{KB_CANDIDATES_JSON}}"
    )
    msgs = _split_system_user(
        template,
        normalized_json='{"domain":"b2b"}',
        requirements_json='{"functional":[]}',
        findings_json='{"findings":[]}',
        kb_json='[{"id":"gcp.cloud-run"}]',
    )
    assert len(msgs) == 2
    assert msgs[0].role == "system"
    assert "TESSAR" in msgs[0].content
    assert '"domain":"b2b"' in msgs[1].content
    assert '"functional":[]' in msgs[1].content
    assert '"findings":[]' in msgs[1].content
    assert '"gcp.cloud-run"' in msgs[1].content


def test_kb_to_prompt_dicts_keeps_only_admissible_fields() -> None:
    kb = _kb()
    out = _kb_to_prompt_dicts(kb)
    assert out[0]["id"] == "gcp.cloud-run"
    assert out[0]["cloud"] == "gcp"
    # ensure cost/sources are NOT leaked into the prompt (cost comes later)
    assert "baseline_cost_usd_per_month" not in out[0]
    assert "sources" not in out[0]


# ─── KB loader smoke (real on-disk records) ────────────────────


def test_kb_loader_loads_real_records() -> None:
    from tessar.kb import load_kb

    records = load_kb()
    assert len(records) >= 1
    ids = {r.id for r in records}
    assert "gcp.cloud-run" in ids


# ─── schema bounds ────────────────────────────────────────────


def test_synthesis_rejects_zero_decisions() -> None:
    with pytest.raises(ValidationError):
        Synthesis.model_validate({"decisions": [], "notes": None})


def test_decision_rejects_zero_citations() -> None:
    bad = _good_payload()
    decisions = bad["decisions"]
    assert isinstance(decisions, list)
    decisions[0] = {**decisions[0], "citations": []}
    with pytest.raises(ValidationError):
        Synthesis.model_validate(bad)
