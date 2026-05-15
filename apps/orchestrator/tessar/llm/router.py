"""LlmRouter: tier-aware multi-provider dispatcher with budget enforcement.

Behaviour (locked by `architecture.instructions.md` LLM tier policy):

  1. Caller passes an `agent_name`. Router looks up the tier via
     `tier_policy.tier_for(agent_name)`.
  2. Router walks `providers` in order. Skips any that don't `supports(tier)`.
  3. For each candidate provider:
        a. Estimate cost via `provider.estimate_cost_usd(...)`.
        b. `budget.precheck(...)` — raises BudgetExceeded if over cap.
        c. `provider.generate(...)`:
             - On `TransientProviderError`: try next provider.
             - On any other exception: re-raise (no retry — saves money).
        d. `budget.charge(response.usage)` — raises BudgetExceeded if now over.
        e. Return the response.
  4. If no provider succeeds, raise `AllProvidersFailed`.

The router DOES NOT retry the same provider. Provider SDKs already retry
on retriable network errors before raising; one provider-level retry is
enough. Re-trying ourselves would amplify cost on partial outages.
"""

from __future__ import annotations

import logging
from collections.abc import Sequence
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError
from typing import TYPE_CHECKING

from .budget import BudgetExceeded, BudgetTracker
from .providers.base import LlmProvider, TransientProviderError
from .tier_policy import tier_for
from .types import LlmMessage, LlmResponse, Tier

if TYPE_CHECKING:
    from collections.abc import Iterable

log = logging.getLogger(__name__)

# Per-tier hard wall-clock cap for a single provider.generate call.
# Tier-A pro models can legitimately stream large JSON responses for ~60s;
# we keep 3 minutes of headroom and treat anything beyond as hung. Without
# this, a single hung HTTPS request to Vertex would block the whole run
# until Cloud Run's 60-min task timeout kills the worker (symptom: run
# stuck at the same phase forever — see incident #stuck-at-56).
DEFAULT_PROVIDER_TIMEOUT_S: dict[Tier, float] = {
    Tier.A: 180.0,
    Tier.B: 90.0,
    Tier.C: 60.0,
}


class AllProvidersFailed(RuntimeError):
    """Raised when every configured provider returned a transient error."""


class LlmRouter:
    """One router per run. Constructed with the budget for that run."""

    def __init__(
        self,
        providers: Sequence[LlmProvider],
        budget: BudgetTracker,
        *,
        provider_timeout_s: dict[Tier, float] | None = None,
    ) -> None:
        if not providers:
            raise ValueError("LlmRouter requires at least one provider")
        self._providers = list(providers)
        self._budget = budget
        self._timeouts = provider_timeout_s or DEFAULT_PROVIDER_TIMEOUT_S
        # One executor per router; a router lives for one run, so the
        # executor disappears with it. We allow a few worker threads so
        # that a hung call (which we abandon at the timeout) does not
        # block the *next* provider in the fallback chain — Python has
        # no safe way to cancel the running thread, so it lingers until
        # the SDK call returns.
        self._executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="llm-call")

    @property
    def budget(self) -> BudgetTracker:
        return self._budget

    def generate(
        self,
        messages: Sequence[LlmMessage],
        *,
        agent_name: str,
        tier: Tier | None = None,
        max_tokens: int = 1024,
        temperature: float = 0.2,
    ) -> LlmResponse:
        """Dispatch one completion. `tier` overrides the tier-policy lookup."""
        resolved_tier = tier or tier_for(agent_name)
        prompt_tokens = _approx_prompt_tokens(messages)

        candidates = [p for p in self._providers if p.supports(resolved_tier)]
        if not candidates:
            raise RuntimeError(f"no provider in chain supports tier {resolved_tier.value}")

        last_transient: TransientProviderError | None = None
        for provider in candidates:
            est_cost = provider.estimate_cost_usd(
                tier=resolved_tier,
                prompt_tokens=prompt_tokens,
                max_completion_tokens=max_tokens,
            )
            # Budget pre-check is hard: if we can't afford even the estimate,
            # we abort the whole run rather than try a cheaper provider.
            # Different providers have different prices, but the cheapest
            # tier-A model is still tier-A; we should not silently downgrade.
            self._budget.precheck(est_cost_usd=est_cost, est_tokens=prompt_tokens + max_tokens)

            try:
                response = self._call_with_timeout(
                    provider,
                    messages,
                    tier=resolved_tier,
                    max_tokens=max_tokens,
                    temperature=temperature,
                )
            except TransientProviderError as e:
                log.warning(
                    "llm.transient_failure provider=%s agent=%s tier=%s err=%s",
                    provider.name,
                    agent_name,
                    resolved_tier.value,
                    e,
                )
                last_transient = e
                continue

            # Successful call — bill it. If this puts us over cap, we still
            # return the response; the next call in this run will be blocked
            # by precheck.
            try:
                self._budget.charge(response.usage)
            except BudgetExceeded as e:
                log.error(
                    "llm.budget_blown agent=%s tier=%s spent_usd=%.4f err=%s",
                    agent_name,
                    resolved_tier.value,
                    response.usage.cost_usd,
                    e,
                )
                raise

            log.info(
                "llm.ok provider=%s agent=%s tier=%s tokens=%d cost_usd=%.4f",
                provider.name,
                agent_name,
                resolved_tier.value,
                response.usage.total_tokens,
                response.usage.cost_usd,
            )
            return response

        raise AllProvidersFailed(
            f"all {len(candidates)} provider(s) for tier {resolved_tier.value} "
            f"raised TransientProviderError; last={last_transient}"
        )

    def _call_with_timeout(
        self,
        provider: LlmProvider,
        messages: Sequence[LlmMessage],
        *,
        tier: Tier,
        max_tokens: int,
        temperature: float,
    ) -> LlmResponse:
        """Run `provider.generate` on a worker thread with a hard wall-clock
        cap. On timeout, raise `TransientProviderError` so the router falls
        over to the next provider in the chain. The orphan thread keeps
        running in the background until the SDK call returns or the worker
        process exits — we accept the leak rather than partially apply
        Python's lack of safe thread cancellation.
        """
        deadline = self._timeouts.get(tier, 120.0)
        future = self._executor.submit(
            provider.generate,
            messages,
            tier=tier,
            max_tokens=max_tokens,
            temperature=temperature,
        )
        try:
            return future.result(timeout=deadline)
        except FuturesTimeoutError as e:
            log.warning(
                "llm.timeout provider=%s tier=%s deadline_s=%.2f",
                provider.name,
                tier.value,
                deadline,
            )
            raise TransientProviderError(
                f"{provider.name}: timed out after {deadline:g}s"
            ) from e


def _approx_prompt_tokens(messages: Iterable[LlmMessage]) -> int:
    """Same heuristic as MockLlmProvider — 1 token ≈ 4 chars. Cheap and
    overestimates English by a hair, which makes the budget pre-check a
    safe lower-bound rather than letting calls slip past."""
    total = 0
    for m in messages:
        total += max(1, len(m.content) // 4)
    return total
