"""Tests for the `research_planner` agent.

Mirrors `test_requirements_extractor.py`. Hermetic via `MockLlmProvider`.
"""

from __future__ import annotations

import json

import pytest
from pydantic import ValidationError

from tessar.agents.research_planner import (
    ResearchPlanningError,
    _split_system_user,
    plan,
)
from tessar.llm import BudgetTracker, LlmRouter, Tier
from tessar.llm.providers.mock import MockLlmProvider
from tessar.schemas import NormalizedBrief, Requirements, ResearchPlan

# ─── helpers ────────────────────────────────────────────────────


def _good_payload() -> dict[str, object]:
    return {
        "questions": [
            {
                "id": "RQ-01",
                "question": (
                    "Is Cloud SQL pgvector fast enough at ~50k embeddings, "
                    "or is a dedicated vector store needed?"
                ),
                "rationale": (
                    "Wrong answer either over-spends on a vector DB or "
                    "blows the latency NFR for semantic search."
                ),
                "category": "component_choice",
                "priority": "high",
                "keywords": ["pgvector benchmark", "cloud sql vector", "p95 latency"],
                "relates_to": ["NFR-01"],
            },
            {
                "id": "RQ-02",
                "question": (
                    "What is the minimum-viable SOC-2 control set for a "
                    "GCP-hosted multi-tenant SaaS in year one?"
                ),
                "rationale": (
                    "Wrong answer either delays SOC-2 readiness past month "
                    "12 or front-loads expensive controls the MVP doesn't need."
                ),
                "category": "compliance",
                "priority": "high",
                "keywords": ["soc2 type ii", "gcp shared responsibility", "audit scope"],
                "relates_to": ["NFR-03"],
            },
            {
                "id": "RQ-03",
                "question": (
                    "What is the cost shape of Cloud Run min-instances=1 "
                    "vs min=0 for a workload at 200 paying tenants?"
                ),
                "rationale": (
                    "Min=1 removes cold starts but raises the cost floor; "
                    "this trade-off shapes the cost estimate."
                ),
                "category": "pricing",
                "priority": "medium",
                "keywords": ["cloud run min instances", "cold start", "idle cost"],
                "relates_to": [],
            },
        ],
        "notes": None,
    }


def _normalized() -> NormalizedBrief:
    return NormalizedBrief.model_validate(
        {
            "summary": "B2B CRM aimed at small sales teams with EU residency.",
            "domain": "b2b",
            "scale": "growing",
            "region": "eu",
            "cloud": "any",
            "compliance": ["soc2", "gdpr"],
            "latency": "standard",
            "budget": "standard",
            "key_constraints": [
                "SOC-2 readiness within 12 months",
                "EU data residency",
            ],
            "provenance": {
                "domain": "brief",
                "scale": "default",
                "region": "brief",
                "cloud": "default",
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
                    "title": "Capture leads from web form",
                    "description": "Sales reps capture form submissions into the CRM.",
                    "priority": "must",
                },
            ],
            "non_functional": [
                {
                    "id": "NFR-01",
                    "category": "performance",
                    "statement": "Page interactions feel instant.",
                    "target": "p95 < 200ms",
                },
                {
                    "id": "NFR-02",
                    "category": "compliance",
                    "statement": "EU customer data must remain in EU regions.",
                    "target": None,
                },
                {
                    "id": "NFR-03",
                    "category": "security",
                    "statement": "SOC-2 Type II readiness within 12 months.",
                    "target": "SOC-2 Type II audit-ready by month 12",
                },
            ],
            "personas": ["Sales rep at 5-30 person team"],
            "out_of_scope": ["Marketing automation"],
            "assumptions": ["Assumed multi-tenant by tenant_id."],
            "open_questions": [],
        }
    )


def _router(provider: MockLlmProvider) -> LlmRouter:
    return LlmRouter([provider], BudgetTracker(cap_usd=1.0, cap_tokens=100_000))


# ─── happy path ────────────────────────────────────────────────


def test_research_planner_happy_path() -> None:
    payload = json.dumps(_good_payload())
    p = MockLlmProvider(responder=lambda _msgs, _tier: payload)
    result = plan(_normalized(), _requirements(), router=_router(p))

    assert isinstance(result, ResearchPlan)
    assert len(result.questions) == 3
    assert result.questions[0].id == "RQ-01"
    assert result.questions[0].priority == "high"
    assert any(q.category == "compliance" for q in result.questions)


def test_research_planner_strips_json_fence() -> None:
    payload = "```json\n" + json.dumps(_good_payload()) + "\n```"
    p = MockLlmProvider(responder=lambda _msgs, _tier: payload)
    result = plan(_normalized(), _requirements(), router=_router(p))
    assert len(result.questions) == 3


def test_research_planner_uses_tier_b() -> None:
    captured: list[Tier] = []

    def responder(_msgs, tier):
        captured.append(tier)
        return json.dumps(_good_payload())

    p = MockLlmProvider(responder=responder)
    plan(_normalized(), _requirements(), router=_router(p))
    assert captured == [Tier.B]


# ─── validation retry ─────────────────────────────────────────


def test_research_planner_retries_once_on_bad_json() -> None:
    responses = iter(["not json", json.dumps(_good_payload())])
    p = MockLlmProvider(responder=lambda _msgs, _tier: next(responses))
    result = plan(_normalized(), _requirements(), router=_router(p))
    assert len(result.questions) == 3


def test_research_planner_retries_once_on_validation_error() -> None:
    """First response violates the RQ-NN id pattern; second is valid."""
    bad = _good_payload()
    bad_qs = bad["questions"]
    assert isinstance(bad_qs, list)
    bad_qs[0] = {**bad_qs[0], "id": "not-a-valid-id"}  # type: ignore[dict-item]
    responses = iter([json.dumps(bad), json.dumps(_good_payload())])
    p = MockLlmProvider(responder=lambda _msgs, _tier: next(responses))
    result = plan(_normalized(), _requirements(), router=_router(p))
    assert result.questions[0].id == "RQ-01"


def test_research_planner_raises_after_two_failures() -> None:
    p = MockLlmProvider(responder=lambda _msgs, _tier: "still not json")
    with pytest.raises(ResearchPlanningError) as excinfo:
        plan(_normalized(), _requirements(), router=_router(p))
    assert excinfo.value.raw_text == "still not json"
    assert excinfo.value.validation_error


# ─── interaction with the router ──────────────────────────────


def test_research_planner_router_falls_back_on_transient() -> None:
    failing = MockLlmProvider(fail_n_times=1)
    healthy = MockLlmProvider(responder=lambda _msgs, _tier: json.dumps(_good_payload()))
    router = LlmRouter([failing, healthy], BudgetTracker(cap_usd=1.0, cap_tokens=100_000))
    result = plan(_normalized(), _requirements(), router=router)
    assert len(result.questions) == 3


def test_research_planner_propagates_budget_exceeded() -> None:
    from tessar.llm import BudgetExceeded

    p = MockLlmProvider(responder=lambda _msgs, _tier: json.dumps(_good_payload()))
    tiny = LlmRouter([p], BudgetTracker(cap_usd=0.0001, cap_tokens=100_000))
    with pytest.raises(BudgetExceeded):
        plan(_normalized(), _requirements(), router=tiny)


# ─── prompt template plumbing ─────────────────────────────────


def test_split_system_user_substitutes_placeholders() -> None:
    template = (
        "## System\nYou are TESSAR.\n\n"
        "## User\nNorm: {{NORMALIZED_BRIEF_JSON}}\nReqs: {{REQUIREMENTS_JSON}}"
    )
    msgs = _split_system_user(
        template,
        normalized_json='{"domain":"b2b"}',
        requirements_json='{"functional":[]}',
    )
    assert len(msgs) == 2
    assert msgs[0].role == "system"
    assert "TESSAR" in msgs[0].content
    assert msgs[1].role == "user"
    assert '"domain":"b2b"' in msgs[1].content
    assert '"functional":[]' in msgs[1].content


# ─── schema bounds ────────────────────────────────────────────


def test_research_plan_rejects_more_than_eight_questions() -> None:
    bad = _good_payload()
    template_q = bad["questions"][0]  # type: ignore[index]
    questions = [{**template_q, "id": f"RQ-{i:02d}"} for i in range(1, 10)]  # 9 items
    bad["questions"] = questions
    with pytest.raises(ValidationError):
        ResearchPlan.model_validate(bad)


def test_research_plan_rejects_empty_questions_list() -> None:
    bad = _good_payload()
    bad["questions"] = []
    with pytest.raises(ValidationError):
        ResearchPlan.model_validate(bad)
