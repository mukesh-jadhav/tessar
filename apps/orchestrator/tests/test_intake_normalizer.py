"""Tests for the `intake_normalizer` agent.

Uses `MockLlmProvider` with a scripted responder so we can:
  - assert the happy path produces a valid `NormalizedBrief`
  - assert one validation retry happens on bad JSON
  - assert two failures raise `IntakeNormalizationError`
  - assert transient provider errors are router-handled (fallback)
  - assert budget overruns abort the run

No network, no SDKs, deterministic.
"""

from __future__ import annotations

import json

import pytest
from pydantic import ValidationError

from tessar.agents.intake_normalizer import (
    IntakeNormalizationError,
    _split_system_user,
    normalize,
)
from tessar.llm import BudgetTracker, LlmRouter, Tier
from tessar.llm.providers.mock import MockLlmProvider
from tessar.schemas import BriefGuide, BriefInput, NormalizedBrief

# ─── helpers ────────────────────────────────────────────────────


def _good_payload(domain: str = "b2b") -> dict[str, object]:
    return {
        "summary": "A B2B CRM aimed at small sales teams that have outgrown spreadsheets.",
        "domain": domain,
        "scale": "growing",
        "region": "global",
        "cloud": "any",
        "compliance": ["soc2"],
        "latency": "standard",
        "budget": "standard",
        "key_constraints": ["SOC-2 readiness within 12 months", "EU data residency"],
        "provenance": {
            "domain": "brief",
            "scale": "default",
            "region": "default",
            "cloud": "default",
            "compliance": "brief",
            "latency": "default",
            "budget": "default",
        },
    }


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


def test_intake_normalizer_happy_path() -> None:
    payload = json.dumps(_good_payload())
    p = MockLlmProvider(responder=lambda _msgs, _tier: payload)
    result = normalize(_brief(), router=_router(p))

    assert isinstance(result, NormalizedBrief)
    assert result.domain == "b2b"
    assert "soc2" in result.compliance
    assert len(result.key_constraints) == 2


def test_intake_normalizer_strips_json_fence() -> None:
    """Some models wrap JSON in ```json``` despite instructions."""
    payload = "```json\n" + json.dumps(_good_payload()) + "\n```"
    p = MockLlmProvider(responder=lambda _msgs, _tier: payload)
    result = normalize(_brief(), router=_router(p))
    assert result.domain == "b2b"


def test_intake_normalizer_uses_tier_c() -> None:
    """The tier policy must route this agent to Tier-C (cheap)."""
    captured: list[Tier] = []

    def responder(_msgs, tier):
        captured.append(tier)
        return json.dumps(_good_payload())

    p = MockLlmProvider(responder=responder)
    normalize(_brief(), router=_router(p))
    assert captured == [Tier.C]


# ─── validation retry ─────────────────────────────────────────


def test_intake_normalizer_retries_once_on_bad_json() -> None:
    """First response is broken; second is valid → succeeds."""
    responses = iter(
        [
            "this is not json at all",
            json.dumps(_good_payload(domain="marketplace")),
        ]
    )
    p = MockLlmProvider(responder=lambda _msgs, _tier: next(responses))
    result = normalize(_brief(), router=_router(p))
    assert result.domain == "marketplace"


def test_intake_normalizer_retries_once_on_validation_error() -> None:
    """First response misses a required field; second is valid."""
    bad = _good_payload()
    del bad["domain"]
    responses = iter([json.dumps(bad), json.dumps(_good_payload())])
    p = MockLlmProvider(responder=lambda _msgs, _tier: next(responses))
    result = normalize(_brief(), router=_router(p))
    assert result.domain == "b2b"


def test_intake_normalizer_raises_after_two_failures() -> None:
    """Two consecutive validation failures → IntakeNormalizationError."""
    p = MockLlmProvider(responder=lambda _msgs, _tier: "still not json")
    with pytest.raises(IntakeNormalizationError) as excinfo:
        normalize(_brief(), router=_router(p))
    assert excinfo.value.raw_text == "still not json"
    assert excinfo.value.validation_error  # non-empty


# ─── interaction with the router ──────────────────────────────


def test_intake_normalizer_router_falls_back_on_transient() -> None:
    """A transient failure on the primary provider → router uses the
    backup. Agent does NOT see the failure."""
    failing = MockLlmProvider(fail_n_times=1)
    healthy = MockLlmProvider(
        responder=lambda _msgs, _tier: json.dumps(_good_payload(domain="data"))
    )
    router = LlmRouter([failing, healthy], BudgetTracker(cap_usd=1.0, cap_tokens=100_000))
    result = normalize(_brief(), router=router)
    assert result.domain == "data"


def test_intake_normalizer_propagates_budget_exceeded() -> None:
    """Budget abort surfaces as `BudgetExceeded`, not silently swallowed."""
    from tessar.llm import BudgetExceeded

    p = MockLlmProvider(responder=lambda _msgs, _tier: json.dumps(_good_payload()))
    tiny = LlmRouter([p], BudgetTracker(cap_usd=0.0001, cap_tokens=100_000))
    with pytest.raises(BudgetExceeded):
        normalize(_brief(), router=tiny)


# ─── prompt template plumbing ─────────────────────────────────


def test_split_system_user_substitutes_placeholders() -> None:
    template = "## System\nYou are TESSAR.\n\n## User\nGuide: {{GUIDE_JSON}}\nBrief: {{BRIEF_TEXT}}"
    msgs = _split_system_user(template, brief="hello", guide_json='{"a":1}')
    assert len(msgs) == 2
    assert msgs[0].role == "system"
    assert "TESSAR" in msgs[0].content
    assert msgs[1].role == "user"
    assert "hello" in msgs[1].content
    assert '{"a":1}' in msgs[1].content


def test_brief_input_rejects_short_brief() -> None:
    """Mirror of the web Zod schema: <80 chars is rejected at the
    Pydantic boundary too."""
    with pytest.raises(ValidationError):
        BriefInput(brief="too short")
