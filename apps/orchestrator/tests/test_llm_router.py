"""Unit tests for the LLM router, budget, tier policy.

Pure-Python; no network, no SDKs. Live-provider tests live in a separate
suite (Phase 3.2 follow-up) and are gated behind an env flag.
"""

from __future__ import annotations

import pytest

from tessar.llm import (
    BudgetExceeded,
    BudgetTracker,
    LlmMessage,
    LlmRouter,
    Tier,
)
from tessar.llm.providers.mock import MockLlmProvider
from tessar.llm.router import AllProvidersFailed
from tessar.llm.tier_policy import tier_for

# ─── tier policy ────────────────────────────────────────────────


def test_tier_for_known_agents() -> None:
    assert tier_for("synthesizer") == Tier.A
    assert tier_for("architect") == Tier.A
    assert tier_for("risk_and_tradeoff_writer") == Tier.A
    assert tier_for("requirements_extractor") == Tier.B
    assert tier_for("research_worker") == Tier.B
    assert tier_for("intake_normalizer") == Tier.C


def test_tier_for_unknown_defaults_to_b() -> None:
    assert tier_for("brand_new_agent_42") == Tier.B


# ─── budget tracker ─────────────────────────────────────────────


def test_budget_rejects_invalid_caps() -> None:
    with pytest.raises(ValueError):
        BudgetTracker(cap_usd=0.0, cap_tokens=1000)
    with pytest.raises(ValueError):
        BudgetTracker(cap_usd=1.0, cap_tokens=0)


def test_budget_precheck_blocks_over_usd_cap() -> None:
    b = BudgetTracker(cap_usd=0.10, cap_tokens=1_000_000)
    with pytest.raises(BudgetExceeded, match="USD"):
        b.precheck(est_cost_usd=0.20, est_tokens=10)


def test_budget_precheck_blocks_over_token_cap() -> None:
    b = BudgetTracker(cap_usd=10.0, cap_tokens=100)
    with pytest.raises(BudgetExceeded, match="token"):
        b.precheck(est_cost_usd=0.0001, est_tokens=200)


# ─── router happy path ─────────────────────────────────────────


def test_router_happy_path_uses_first_provider() -> None:
    primary = MockLlmProvider()
    backup = MockLlmProvider()
    router = LlmRouter([primary, backup], BudgetTracker(cap_usd=1.0, cap_tokens=10_000))

    resp = router.generate(
        [LlmMessage(role="user", content="hello")],
        agent_name="intake_normalizer",
        max_tokens=64,
    )
    assert resp.tier == Tier.C  # tier policy mapped intake_normalizer -> C
    assert resp.provider == "mock"
    assert resp.usage.cost_usd > 0


def test_router_explicit_tier_overrides_policy() -> None:
    p = MockLlmProvider()
    router = LlmRouter([p], BudgetTracker(cap_usd=1.0, cap_tokens=10_000))
    resp = router.generate(
        [LlmMessage(role="user", content="hi")],
        agent_name="intake_normalizer",
        tier=Tier.A,
    )
    assert resp.tier == Tier.A


# ─── router fallback ───────────────────────────────────────────


def test_router_falls_back_on_transient_failure() -> None:
    failing = MockLlmProvider(fail_n_times=1)
    healthy = MockLlmProvider()
    router = LlmRouter([failing, healthy], BudgetTracker(cap_usd=1.0, cap_tokens=10_000))

    resp = router.generate(
        [LlmMessage(role="user", content="hello")],
        agent_name="research_worker",
    )
    assert resp.text.startswith("[mock-B]")  # tier-B for research_worker


def test_router_raises_when_all_providers_fail() -> None:
    p1 = MockLlmProvider(fail_n_times=99)
    p2 = MockLlmProvider(fail_n_times=99)
    router = LlmRouter([p1, p2], BudgetTracker(cap_usd=1.0, cap_tokens=10_000))
    with pytest.raises(AllProvidersFailed):
        router.generate(
            [LlmMessage(role="user", content="hi")],
            agent_name="research_worker",
        )


def test_router_does_not_retry_on_non_transient_error() -> None:
    """Validation errors etc. should NOT trigger fallback — bubble unchanged."""

    class BoomProvider(MockLlmProvider):
        def generate(self, messages, *, tier, max_tokens, temperature):
            raise ValueError("not a transient error")

    boom = BoomProvider()
    healthy = MockLlmProvider()
    router = LlmRouter([boom, healthy], BudgetTracker(cap_usd=1.0, cap_tokens=10_000))
    with pytest.raises(ValueError, match="not a transient error"):
        router.generate(
            [LlmMessage(role="user", content="hi")],
            agent_name="research_worker",
        )


def test_router_skips_providers_that_dont_support_tier() -> None:
    cheap_only = MockLlmProvider(supported_tiers={Tier.C})
    full = MockLlmProvider()
    router = LlmRouter([cheap_only, full], BudgetTracker(cap_usd=1.0, cap_tokens=10_000))
    # Architect needs tier-A; cheap_only must be skipped.
    resp = router.generate(
        [LlmMessage(role="user", content="hi")],
        agent_name="architect",
    )
    assert resp.tier == Tier.A


def test_router_raises_when_no_provider_supports_tier() -> None:
    cheap = MockLlmProvider(supported_tiers={Tier.C})
    router = LlmRouter([cheap], BudgetTracker(cap_usd=1.0, cap_tokens=10_000))
    with pytest.raises(RuntimeError, match="no provider in chain supports tier"):
        router.generate(
            [LlmMessage(role="user", content="hi")],
            agent_name="architect",  # tier A
        )


# ─── budget enforcement at the router boundary ────────────────


def test_router_aborts_run_when_budget_blown() -> None:
    tiny = BudgetTracker(cap_usd=0.0001, cap_tokens=10_000)
    router = LlmRouter([MockLlmProvider()], tiny)
    with pytest.raises(BudgetExceeded):
        router.generate(
            [LlmMessage(role="user", content="x" * 1000)],
            agent_name="architect",  # tier-A is the most expensive in the mock
        )


def test_budget_state_tracks_running_total() -> None:
    b = BudgetTracker(cap_usd=1.0, cap_tokens=10_000)
    router = LlmRouter([MockLlmProvider()], b)
    router.generate([LlmMessage(role="user", content="hi")], agent_name="intake_normalizer")
    router.generate([LlmMessage(role="user", content="hi again")], agent_name="intake_normalizer")
    state = b.state()
    assert state.spent_usd > 0
    assert state.spent_tokens > 0
    assert state.remaining_usd < state.cap_usd


# ─── router timeout (incident #stuck-at-56) ─────────────────────


def test_router_times_out_hung_provider_and_falls_over() -> None:
    """A provider that hangs past the per-tier deadline is treated as a
    transient failure; the next provider in the chain handles the call."""
    import time

    from tessar.llm.providers.mock import MockLlmProvider

    class HangingProvider(MockLlmProvider):
        name = "hanging"

        def generate(self, messages, *, tier, max_tokens, temperature):  # type: ignore[override]
            time.sleep(5)  # would normally exceed our timeout
            return super().generate(
                messages, tier=tier, max_tokens=max_tokens, temperature=temperature
            )

    healthy = MockLlmProvider()
    router = LlmRouter(
        [HangingProvider(), healthy],
        BudgetTracker(cap_usd=1.0, cap_tokens=10_000),
        provider_timeout_s={Tier.A: 0.1, Tier.B: 0.1, Tier.C: 0.1},
    )
    resp = router.generate(
        [LlmMessage(role="user", content="hi")],
        agent_name="research_worker",
    )
    # Healthy provider answered after the hung one timed out.
    assert resp.provider != "hanging"


def test_router_raises_when_all_providers_time_out() -> None:
    """If every provider hangs, router raises AllProvidersFailed (not a
    bare timeout error) so callers can branch on the same exception."""
    import time

    from tessar.llm.providers.mock import MockLlmProvider

    class Hanger(MockLlmProvider):
        def generate(self, messages, *, tier, max_tokens, temperature):  # type: ignore[override]
            time.sleep(5)
            return super().generate(
                messages, tier=tier, max_tokens=max_tokens, temperature=temperature
            )

    router = LlmRouter(
        [Hanger(), Hanger()],
        BudgetTracker(cap_usd=1.0, cap_tokens=10_000),
        provider_timeout_s={Tier.A: 0.1, Tier.B: 0.1, Tier.C: 0.1},
    )
    with pytest.raises(AllProvidersFailed):
        router.generate(
            [LlmMessage(role="user", content="hi")],
            agent_name="research_worker",
        )
