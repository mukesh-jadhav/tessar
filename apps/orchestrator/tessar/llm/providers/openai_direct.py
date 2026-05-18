"""OpenAI direct provider — last-resort fallback per ADR-0015.

Only reached when BOTH Vertex Claude AND Vertex Gemini failed for a call.
This exists so a single-vendor outage on Google Cloud (Vertex regional
incident, IAM mis-config) doesn't take TESSAR's entire run loop down.

Behaviour mirrors `vertex_gemini.py` / `vertex_claude.py`:
  - Lazy SDK import: `from openai import OpenAI` is deferred so importing
    this module never fails on a box without the `openai` package.
  - Tier -> model mapping defaults to the GPT-5 family:
        Tier.A -> gpt-5
        Tier.B -> gpt-5-mini
        Tier.C -> gpt-5-nano
    All three tiers are supported (this is the fallback for everyone).
  - JSON mode: OpenAI Chat Completions supports
    `response_format={"type": "json_object"}` natively — used unconditionally
    because every TESSAR agent emits strict JSON.
  - 5xx / 429 / connection errors -> `TransientProviderError`. 4xx
    auth / validation bubble unchanged.
  - `finish_reason == "length"` -> `OutputTruncatedError` (same contract as
    the Vertex providers — the calling agent decides whether to retry with
    a larger budget).
  - Cost estimate uses static per-1k-token rates from OpenAI's price sheet
    (May 2026 GPT-5 pricing). Refreshed quarterly per the KB freshness SLA.

This provider is NOT instantiated unless `settings.openai_api_key` is set —
keeping it out of the chain is the right behaviour when the key is missing.
"""

from __future__ import annotations

import logging
from collections.abc import Sequence
from typing import Any

from ..types import LlmMessage, LlmResponse, LlmUsage, Tier
from .base import LlmProvider, OutputTruncatedError, TransientProviderError

log = logging.getLogger(__name__)


# Per-1k-token USD pricing for OpenAI GPT-5 family (May 2026 rates).
# Refresh whenever OpenAI publishes new prices; bump and re-baseline evals
# per the 90-day KB freshness SLA.
DEFAULT_PRICING_USD_PER_1K: dict[Tier, dict[str, float]] = {
    # gpt-5: $1.25 / MTok input, $10 / MTok output
    Tier.A: {"input": 0.00125, "output": 0.010},
    # gpt-5-mini: $0.15 / MTok input, $0.60 / MTok output
    Tier.B: {"input": 0.00015, "output": 0.0006},
    # gpt-5-nano: $0.05 / MTok input, $0.20 / MTok output
    Tier.C: {"input": 0.00005, "output": 0.0002},
}

DEFAULT_MODELS: dict[Tier, str] = {
    Tier.A: "gpt-5",
    Tier.B: "gpt-5-mini",
    Tier.C: "gpt-5-nano",
}


# OpenAI SDK transient-error class names. Checked by name so this file stays
# importable without the SDK installed.
_TRANSIENT_NAMES = {
    "APIConnectionError",
    "APIStatusError",  # only when status_code in _TRANSIENT_STATUS
    "APITimeoutError",
    "RateLimitError",
    "InternalServerError",
}
_TRANSIENT_STATUS = {429, 500, 502, 503, 504}


def _lazy_import() -> Any:
    """Import the OpenAI SDK on first use."""
    try:
        from openai import OpenAI  # type: ignore[import-not-found]
    except ImportError as e:
        raise RuntimeError(
            "openai_direct provider requires `openai` installed. "
            "Add to apps/orchestrator/pyproject.toml — see ADR-0015."
        ) from e
    return OpenAI


def _classify_error(exc: BaseException) -> bool:
    """True if the exception should be treated as transient (router has no
    further provider to fall through to — but the router itself will
    surface this as `AllProvidersFailed` so the agent can decide)."""
    name = type(exc).__name__
    if name not in _TRANSIENT_NAMES:
        return False
    if name == "APIStatusError":
        status = getattr(exc, "status_code", None)
        return status in _TRANSIENT_STATUS
    return True


def _to_openai_messages(messages: Sequence[LlmMessage]) -> list[dict[str, str]]:
    """OpenAI's Chat Completions message shape is 1:1 with our `LlmMessage`
    (role + content). No splitting required — `system` is just another role."""
    return [{"role": m.role, "content": m.content} for m in messages]


class OpenAIDirectProvider(LlmProvider):
    """Adapter for OpenAI's Chat Completions API.

    Construct with `(api_key=..., base_url=None)`. The SDK picks up
    `OPENAI_API_KEY` from env automatically, but we pass it explicitly so
    the factory controls the source (Secret Manager in prod).
    """

    name = "openai_direct"

    def __init__(
        self,
        *,
        api_key: str,
        base_url: str | None = None,
        models: dict[Tier, str] | None = None,
        pricing_usd_per_1k: dict[Tier, dict[str, float]] | None = None,
        supported_tiers: set[Tier] | None = None,
        timeout_seconds: float = 60.0,
    ) -> None:
        self._api_key = api_key
        self._base_url = base_url
        self._models = models or DEFAULT_MODELS
        self._pricing = pricing_usd_per_1k or DEFAULT_PRICING_USD_PER_1K
        # Default: all tiers. This is the last-resort fallback for the
        # whole chain, so it must serve everyone unless explicitly narrowed.
        self._supported = supported_tiers or {Tier.A, Tier.B, Tier.C}
        self._timeout_seconds = timeout_seconds
        self._client: Any = None

    def supports(self, tier: Tier) -> bool:
        return tier in self._supported and tier in self._models

    def estimate_cost_usd(
        self,
        *,
        tier: Tier,
        prompt_tokens: int,
        max_completion_tokens: int,
    ) -> float:
        rates = self._pricing[tier]
        return (
            prompt_tokens / 1000.0 * rates["input"]
            + max_completion_tokens / 1000.0 * rates["output"]
        )

    def _ensure_client(self) -> Any:
        if self._client is None:
            OpenAI = _lazy_import()
            kwargs: dict[str, Any] = {
                "api_key": self._api_key,
                "timeout": self._timeout_seconds,
            }
            if self._base_url:
                kwargs["base_url"] = self._base_url
            self._client = OpenAI(**kwargs)
        return self._client

    def generate(
        self,
        messages: Sequence[LlmMessage],
        *,
        tier: Tier,
        max_tokens: int,
        temperature: float,
    ) -> LlmResponse:
        client = self._ensure_client()
        model_id = self._models[tier]
        oai_messages = _to_openai_messages(messages)

        try:
            result = client.chat.completions.create(
                model=model_id,
                messages=oai_messages,
                max_tokens=max_tokens,
                temperature=temperature,
                response_format={"type": "json_object"},
            )
        except Exception as e:
            if _classify_error(e):
                raise TransientProviderError(f"openai_direct: {type(e).__name__}: {e}") from e
            raise

        # Chat Completions shape: result.choices[0].message.content,
        # result.choices[0].finish_reason, result.usage.{prompt,completion}_tokens.
        choices = getattr(result, "choices", None) or []
        if not choices:
            raise TransientProviderError(f"openai_direct: model={model_id} returned no choices")
        choice = choices[0]
        message = getattr(choice, "message", None)
        text = (getattr(message, "content", "") or "").strip()
        finish_reason = getattr(choice, "finish_reason", "") or ""

        usage = getattr(result, "usage", None)
        prompt_tokens = int(getattr(usage, "prompt_tokens", 0) or 0)
        completion_tokens = int(getattr(usage, "completion_tokens", 0) or 0)

        log.info(
            "openai_direct.ok model=%s tier=%s prompt_tokens=%d completion_tokens=%d "
            "max_tokens=%d finish_reason=%s",
            model_id,
            tier.value,
            prompt_tokens,
            completion_tokens,
            max_tokens,
            finish_reason or "UNKNOWN",
        )

        if finish_reason == "length":
            raise OutputTruncatedError(
                f"openai_direct: response truncated at max_tokens={max_tokens} "
                f"(model={model_id}, completion_tokens={completion_tokens})",
                partial_text=text,
            )

        rates = self._pricing[tier]
        cost_usd = (
            prompt_tokens / 1000.0 * rates["input"] + completion_tokens / 1000.0 * rates["output"]
        )

        return LlmResponse(
            text=text,
            provider=self.name,
            model=model_id,
            tier=tier,
            usage=LlmUsage(
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                cost_usd=cost_usd,
            ),
        )
