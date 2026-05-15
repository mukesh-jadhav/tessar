"""LlmProvider abstract base + transient-error sentinel."""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Sequence

from ..types import LlmMessage, LlmResponse, Tier


class TransientProviderError(RuntimeError):
    """Provider call failed in a way the router should retry against the
    next provider in the chain (network error, 5xx, quota, rate limit).

    NOT raised for validation errors, malformed prompts, or auth failures —
    those bubble up unchanged because retrying won't help.
    """


class OutputTruncatedError(RuntimeError):
    """The model returned a response that hit `max_output_tokens` mid-output
    (Vertex `finish_reason == MAX_TOKENS`, OpenAI `finish_reason == "length"`).

    Distinct from `TransientProviderError` because falling back to a different
    provider with the same budget will not help — only the calling agent knows
    whether retrying with a larger budget is safe (cost) or whether to give up.
    Agents that produce strict JSON (architect, synthesizer) should catch this
    and retry on the same provider with a higher `max_tokens`.
    """

    def __init__(self, message: str, *, partial_text: str = "") -> None:
        super().__init__(message)
        self.partial_text = partial_text


class LlmProvider(ABC):
    """Adapter for one LLM vendor (e.g. Vertex Gemini)."""

    name: str  # short id for logs / audit ("vertex_gemini", "openai", ...)

    @abstractmethod
    def supports(self, tier: Tier) -> bool:
        """Return True if this provider has a configured model for this tier."""

    @abstractmethod
    def generate(
        self,
        messages: Sequence[LlmMessage],
        *,
        tier: Tier,
        max_tokens: int,
        temperature: float,
    ) -> LlmResponse:
        """Issue one completion. Raises `TransientProviderError` on failures
        the router should treat as fall-through-to-next-provider."""

    @abstractmethod
    def estimate_cost_usd(
        self,
        *,
        tier: Tier,
        prompt_tokens: int,
        max_completion_tokens: int,
    ) -> float:
        """Pre-call cost estimate. Used by the budget tracker for `precheck`."""
