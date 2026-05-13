"""Tests for the `requirements_extractor` agent.

Mirrors the structure of `test_intake_normalizer.py`. Uses a scripted
`MockLlmProvider` so the suite is hermetic.
"""

from __future__ import annotations

import json

import pytest
from pydantic import ValidationError

from tessar.agents.requirements_extractor import (
    RequirementsExtractionError,
    _split_system_user,
    extract,
)
from tessar.llm import BudgetTracker, LlmRouter, Tier
from tessar.llm.providers.mock import MockLlmProvider
from tessar.schemas import BriefGuide, BriefInput, NormalizedBrief, Requirements

# ─── helpers ────────────────────────────────────────────────────


def _good_payload() -> dict[str, object]:
    return {
        "functional": [
            {
                "id": "FR-01",
                "title": "Capture leads from web form",
                "description": (
                    "Sales reps can paste a public form URL and capture submissions "
                    "into the CRM with deduplication on email."
                ),
                "priority": "must",
            },
            {
                "id": "FR-02",
                "title": "Pipeline stages with drag-drop",
                "description": "Reps move deals across pipeline stages on a kanban board.",
                "priority": "must",
            },
            {
                "id": "FR-03",
                "title": "CSV import",
                "description": "One-shot CSV import of existing contacts at onboarding.",
                "priority": "should",
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
                "statement": "SOC-2 readiness within 12 months.",
                "target": "SOC-2 Type II audit-ready by month 12",
            },
        ],
        "personas": ["Sales rep at 5-30 person team", "RevOps admin"],
        "out_of_scope": ["Marketing automation", "Native mobile app"],
        "assumptions": [
            "Assumed multi-tenant isolation by tenant_id; brief did not specify.",
            "Assumed English-only UI for MVP.",
        ],
        "open_questions": [
            "Is single sign-on (Google/Microsoft) required at MVP?",
            "Is offline mode for the kanban board needed?",
        ],
    }


def _normalized() -> NormalizedBrief:
    return NormalizedBrief.model_validate(
        {
            "summary": (
                "A B2B CRM aimed at small sales teams that have outgrown "
                "spreadsheets, with EU residency."
            ),
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


def _brief() -> BriefInput:
    return BriefInput(
        brief=(
            "We are building a B2B CRM aimed at 5- to 30-person sales teams "
            "that have outgrown spreadsheets. SOC-2 readiness within 12 months. "
            "EU data residency required. ~200 paying workspaces in year 1."
        ),
        guide=BriefGuide(),
    )


def _router(provider: MockLlmProvider) -> LlmRouter:
    return LlmRouter([provider], BudgetTracker(cap_usd=1.0, cap_tokens=100_000))


# ─── happy path ────────────────────────────────────────────────


def test_requirements_extractor_happy_path() -> None:
    payload = json.dumps(_good_payload())
    p = MockLlmProvider(responder=lambda _msgs, _tier: payload)
    result = extract(_brief(), _normalized(), router=_router(p))

    assert isinstance(result, Requirements)
    assert len(result.functional) == 3
    assert result.functional[0].id == "FR-01"
    assert result.functional[0].priority == "must"
    assert any(nfr.category == "compliance" for nfr in result.non_functional)
    assert len(result.open_questions) == 2


def test_requirements_extractor_strips_json_fence() -> None:
    payload = "```json\n" + json.dumps(_good_payload()) + "\n```"
    p = MockLlmProvider(responder=lambda _msgs, _tier: payload)
    result = extract(_brief(), _normalized(), router=_router(p))
    assert len(result.functional) == 3


def test_requirements_extractor_uses_tier_b() -> None:
    captured: list[Tier] = []

    def responder(_msgs, tier):
        captured.append(tier)
        return json.dumps(_good_payload())

    p = MockLlmProvider(responder=responder)
    extract(_brief(), _normalized(), router=_router(p))
    assert captured == [Tier.B]


# ─── validation retry ─────────────────────────────────────────


def test_requirements_extractor_retries_once_on_bad_json() -> None:
    responses = iter(["not json", json.dumps(_good_payload())])
    p = MockLlmProvider(responder=lambda _msgs, _tier: next(responses))
    result = extract(_brief(), _normalized(), router=_router(p))
    assert len(result.functional) == 3


def test_requirements_extractor_retries_once_on_validation_error() -> None:
    """First response violates the FR-NN id pattern; second is valid."""
    bad = _good_payload()
    bad_funcs = bad["functional"]
    assert isinstance(bad_funcs, list)
    bad_funcs[0] = {**bad_funcs[0], "id": "not-a-valid-id"}  # type: ignore[dict-item]
    responses = iter([json.dumps(bad), json.dumps(_good_payload())])
    p = MockLlmProvider(responder=lambda _msgs, _tier: next(responses))
    result = extract(_brief(), _normalized(), router=_router(p))
    assert result.functional[0].id == "FR-01"


def test_requirements_extractor_raises_after_two_failures() -> None:
    p = MockLlmProvider(responder=lambda _msgs, _tier: "still not json")
    with pytest.raises(RequirementsExtractionError) as excinfo:
        extract(_brief(), _normalized(), router=_router(p))
    assert excinfo.value.raw_text == "still not json"
    assert excinfo.value.validation_error


# ─── interaction with the router ──────────────────────────────


def test_requirements_extractor_router_falls_back_on_transient() -> None:
    failing = MockLlmProvider(fail_n_times=1)
    healthy = MockLlmProvider(responder=lambda _msgs, _tier: json.dumps(_good_payload()))
    router = LlmRouter([failing, healthy], BudgetTracker(cap_usd=1.0, cap_tokens=100_000))
    result = extract(_brief(), _normalized(), router=router)
    assert len(result.functional) == 3


def test_requirements_extractor_propagates_budget_exceeded() -> None:
    from tessar.llm import BudgetExceeded

    p = MockLlmProvider(responder=lambda _msgs, _tier: json.dumps(_good_payload()))
    tiny = LlmRouter([p], BudgetTracker(cap_usd=0.0001, cap_tokens=100_000))
    with pytest.raises(BudgetExceeded):
        extract(_brief(), _normalized(), router=tiny)


# ─── prompt template plumbing ─────────────────────────────────


def test_split_system_user_substitutes_placeholders() -> None:
    template = (
        "## System\nYou are TESSAR.\n\n"
        "## User\nNorm: {{NORMALIZED_BRIEF_JSON}}\nBrief: {{BRIEF_TEXT}}"
    )
    msgs = _split_system_user(template, brief_text="hello", normalized_json='{"domain":"b2b"}')
    assert len(msgs) == 2
    assert msgs[0].role == "system"
    assert "TESSAR" in msgs[0].content
    assert msgs[1].role == "user"
    assert "hello" in msgs[1].content
    assert '"domain":"b2b"' in msgs[1].content


# ─── schema bounds ────────────────────────────────────────────


def test_requirements_rejects_more_than_three_open_questions() -> None:
    bad = _good_payload()
    bad["open_questions"] = ["q1", "q2", "q3", "q4"]
    with pytest.raises(ValidationError):
        Requirements.model_validate(bad)


def test_requirements_rejects_empty_functional_list() -> None:
    bad = _good_payload()
    bad["functional"] = []
    with pytest.raises(ValidationError):
        Requirements.model_validate(bad)
