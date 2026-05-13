"""Deterministic mock provider — no network, free, predictable outputs.

Two roles:
  1. Default provider in dev / unit tests so we can exercise the router
     without burning real LLM budget.
  2. Failure-injection harness for testing fallback / budget behaviour
     (`fail_n_times=...`, `cost_per_call_usd=...`).
"""

from __future__ import annotations

import hashlib
from collections.abc import Callable, Sequence

from ..types import LlmMessage, LlmResponse, LlmUsage, Tier
from .base import LlmProvider, TransientProviderError

# Approx per-1k-token cost we *bill* against the mock budget. Picked to be
# cheap-ish and tier-monotonic so tier-A tests really do cost more.
_MOCK_COST_PER_1K_TOKENS_USD: dict[Tier, float] = {
    Tier.A: 0.010,
    Tier.B: 0.002,
    Tier.C: 0.0005,
}


def _approx_token_count(s: str) -> int:
    """Cheap tokenizer-free estimate: 1 token ≈ 4 chars (English mean).
    Good enough for budget pre-checks; real providers report exact usage."""
    return max(1, len(s) // 4)


class MockLlmProvider(LlmProvider):
    """Returns deterministic text derived from a hash of the prompt.

    Pluggable response-builder via `responder=` lets tests script the output
    when they need the agent code to see specific text (e.g. JSON shapes).
    """

    name = "mock"

    def __init__(
        self,
        *,
        supported_tiers: set[Tier] | None = None,
        cost_per_1k_tokens_usd: dict[Tier, float] | None = None,
        fail_n_times: int = 0,
        responder: Callable[[Sequence[LlmMessage], Tier], str] | None = None,
    ) -> None:
        self._supported = supported_tiers or {Tier.A, Tier.B, Tier.C}
        self._costs = cost_per_1k_tokens_usd or _MOCK_COST_PER_1K_TOKENS_USD
        self._failures_remaining = fail_n_times
        self._responder = responder

    def supports(self, tier: Tier) -> bool:
        return tier in self._supported

    def generate(
        self,
        messages: Sequence[LlmMessage],
        *,
        tier: Tier,
        max_tokens: int,
        temperature: float,
    ) -> LlmResponse:
        if self._failures_remaining > 0:
            self._failures_remaining -= 1
            raise TransientProviderError("mock: scripted transient failure")

        if self._responder is not None:
            text = self._responder(messages, tier)
        else:
            joined = "\n".join(m.content for m in messages)
            digest = hashlib.sha256(joined.encode("utf-8")).hexdigest()[:16]
            text = f"[mock-{tier.value}] {digest}"

        prompt_tokens = sum(_approx_token_count(m.content) for m in messages)
        completion_tokens = min(_approx_token_count(text), max_tokens)
        cost_per_1k = self._costs[tier]
        cost_usd = (prompt_tokens + completion_tokens) / 1000.0 * cost_per_1k

        return LlmResponse(
            text=text,
            provider=self.name,
            model=f"mock-tier-{tier.value}",
            tier=tier,
            usage=LlmUsage(
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                cost_usd=cost_usd,
            ),
        )

    def estimate_cost_usd(
        self,
        *,
        tier: Tier,
        prompt_tokens: int,
        max_completion_tokens: int,
    ) -> float:
        cost_per_1k = self._costs[tier]
        return (prompt_tokens + max_completion_tokens) / 1000.0 * cost_per_1k
