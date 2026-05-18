"""Vertex AI Claude (Anthropic Sonnet 4.5) provider — Tier-A primary per ADR-0015.

Behaviour mirrors `vertex_gemini.py`:
  - Lazy SDK import: `anthropic.AnthropicVertex` is deferred so importing
    this module never fails on a box without the `anthropic[vertex]` extra.
  - Tier -> model mapping defaults to Claude Sonnet 4.5 for Tier.A only.
    This provider is configured by the factory with `supported_tiers={Tier.A}`
    so the router automatically skips it for Tier-B/C (Gemini stays primary
    for cheaper tiers — see ADR-0015 cost analysis).
  - 5xx / 429 / overload -> `TransientProviderError` (router falls over to
    next provider).
  - Cost estimate uses static per-1k-token rates from the Vertex AI Anthropic
    price sheet; refreshed quarterly per the KB freshness SLA.
  - JSON mode: Anthropic does not have a `response_mime_type` switch like
    Gemini. We rely on the agent's system prompt already saying "respond
    ONLY with valid JSON" plus an additional terminal instruction. Combined
    with the strict Pydantic validation the agents already do, this matches
    Gemini's effective JSON-only behaviour in practice.

This provider is NOT instantiated unless `settings.vertex_project` is set
(uses the same project/region as Vertex Gemini — single IAM surface).
"""

from __future__ import annotations

import logging
from collections.abc import Sequence
from typing import Any

from ..types import LlmMessage, LlmResponse, LlmUsage, Tier
from .base import LlmProvider, OutputTruncatedError, TransientProviderError

log = logging.getLogger(__name__)


# Per-1k-token USD pricing for Vertex AI Anthropic models (May 2026 rates).
# Refresh whenever Anthropic / Vertex publish new prices; bump and re-baseline
# evals per the 90-day KB freshness SLA.
DEFAULT_PRICING_USD_PER_1K: dict[Tier, dict[str, float]] = {
    # Claude Sonnet 4.5 on Vertex: $3 / MTok input, $15 / MTok output.
    Tier.A: {"input": 0.003, "output": 0.015},
}

DEFAULT_MODELS: dict[Tier, str] = {
    # Vertex's Anthropic model IDs use the `@DATE` suffix for the specific
    # snapshot. Pin to the launch snapshot for reproducibility; bump via PR
    # once the next snapshot ships and evals are re-baselined.
    Tier.A: "claude-sonnet-4-5@20250929",
}

# `max_tokens` is a REQUIRED field for the Anthropic Messages API (Vertex
# included). The router passes the agent's per-call budget through; we just
# forward it without modification.

# Anthropic transient-error class names. We check by name (no hard import)
# so this file stays importable without the SDK installed.
_TRANSIENT_NAMES = {
    "APIConnectionError",
    "APIStatusError",  # only when status_code in {429, 500, 502, 503, 504}
    "APITimeoutError",
    "RateLimitError",
    "InternalServerError",
    "ServiceUnavailableError",
    "OverloadedError",
    # 404 / 403 are PERMANENT on Claude (model not enabled in this project,
    # SA lacks Vertex permission, or wrong region), but they're NOT
    # permanent for the run — the router should fall over to the next
    # Tier-A provider (Gemini Pro per ADR-0015). Without this, a missing
    # Model Garden enable kills every run on the synthesizer.
    "NotFoundError",
    "PermissionDeniedError",
}
_TRANSIENT_STATUS = {429, 500, 502, 503, 504}

# Vertex-side "permanent for THIS provider, but the router has Gemini Pro
# as a documented Tier-A fallback (ADR-0015)" hints. These ride on a
# BadRequestError (400 FAILED_PRECONDITION) when the model isn't published
# in the configured region (e.g. claude-sonnet-4-5 is not in us-central1),
# or on a NotFoundError dressed up as 400 by the Vertex front door. They
# must fall over instead of killing the run.
_PROVIDER_UNAVAILABLE_HINTS = (
    "is not servable",
    "FAILED_PRECONDITION",
    "Publisher Model",
    "was not found",
)


def _lazy_import() -> Any:
    """Import the Anthropic Vertex SDK on first use."""
    try:
        from anthropic import AnthropicVertex  # type: ignore[import-not-found]
    except ImportError as e:
        raise RuntimeError(
            "vertex_claude provider requires `anthropic[vertex]` installed. "
            "Add to apps/orchestrator/pyproject.toml — see ADR-0015."
        ) from e
    return AnthropicVertex


def _classify_error(exc: BaseException) -> bool:
    """True if the exception should be treated as transient (router falls
    over to the next provider in the chain)."""
    name = type(exc).__name__
    # Vertex sometimes surfaces "model/region not available" as a 400
    # FAILED_PRECONDITION (BadRequestError) rather than a clean 404. Detect
    # by message substring so any Anthropic SDK exception class signaling
    # provider-unavailability falls over instead of killing the run.
    msg = str(exc)
    if any(hint in msg for hint in _PROVIDER_UNAVAILABLE_HINTS):
        return True
    if name not in _TRANSIENT_NAMES:
        return False
    # APIStatusError covers both retriable (5xx, 429) and non-retriable
    # (4xx auth / validation) — discriminate by status_code.
    if name == "APIStatusError":
        status = getattr(exc, "status_code", None)
        return status in _TRANSIENT_STATUS
    return True


def _split_system_and_messages(
    messages: Sequence[LlmMessage],
) -> tuple[str, list[dict[str, str]]]:
    """Anthropic Messages API takes `system` as a top-level kwarg (not a
    message). Concatenate any system messages into one string, and pass
    the rest through as user/assistant turns."""
    system_chunks: list[str] = []
    turns: list[dict[str, str]] = []
    for m in messages:
        if m.role == "system":
            system_chunks.append(m.content)
        else:
            turns.append({"role": m.role, "content": m.content})
    # Belt-and-braces JSON instruction — Anthropic has no response_mime_type
    # equivalent, so we reinforce it in the system message. The agents
    # already include their own JSON-only instruction; this is the last line
    # of defence against accidental prose wrapping.
    json_guard = (
        "Respond with a single valid JSON object only. "
        "Do not wrap the response in markdown fences or prose. "
        "Do not include any text before or after the JSON object."
    )
    system_text = "\n\n".join([*system_chunks, json_guard])
    return system_text, turns


class VertexClaudeProvider(LlmProvider):
    """Adapter for Claude on Vertex AI (Anthropic Sonnet 4.5 by default).

    Construct with `(project=..., location="asia-south1")`. Auth is via
    Application Default Credentials — same as Vertex Gemini.
    """

    name = "vertex_claude"

    def __init__(
        self,
        *,
        project: str,
        location: str = "asia-south1",
        models: dict[Tier, str] | None = None,
        pricing_usd_per_1k: dict[Tier, dict[str, float]] | None = None,
        supported_tiers: set[Tier] | None = None,
    ) -> None:
        self._project = project
        self._location = location
        self._models = models or DEFAULT_MODELS
        self._pricing = pricing_usd_per_1k or DEFAULT_PRICING_USD_PER_1K
        # Default: Tier-A only. Per ADR-0015, Claude is NOT used for
        # Tier-B/C — Gemini Flash is consistently good enough there and
        # ~20× cheaper. The factory can override for special cases.
        self._supported = supported_tiers or {Tier.A}
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
            AnthropicVertex = _lazy_import()
            # AnthropicVertex picks up ADC via google-auth automatically.
            self._client = AnthropicVertex(
                project_id=self._project,
                region=self._location,
            )
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
        system_text, turns = _split_system_and_messages(messages)

        try:
            result = client.messages.create(
                model=model_id,
                max_tokens=max_tokens,
                temperature=temperature,
                system=system_text,
                messages=turns,
            )
        except Exception as e:
            if _classify_error(e):
                raise TransientProviderError(f"vertex_claude: {type(e).__name__}: {e}") from e
            raise

        # Anthropic Messages API returns `content` as a list of blocks
        # (typically one `{type: "text", text: ...}` block when not using
        # tool-use). Concatenate any text blocks.
        text_chunks: list[str] = []
        for block in getattr(result, "content", None) or []:
            block_type = getattr(block, "type", None)
            if block_type == "text":
                text_chunks.append(getattr(block, "text", "") or "")
        text = "".join(text_chunks).strip()

        usage = getattr(result, "usage", None)
        prompt_tokens = int(getattr(usage, "input_tokens", 0) or 0)
        completion_tokens = int(getattr(usage, "output_tokens", 0) or 0)

        stop_reason = getattr(result, "stop_reason", None) or ""

        log.info(
            "vertex_claude.ok model=%s tier=%s prompt_tokens=%d completion_tokens=%d "
            "max_tokens=%d stop_reason=%s",
            model_id,
            tier.value,
            prompt_tokens,
            completion_tokens,
            max_tokens,
            stop_reason or "UNKNOWN",
        )

        if stop_reason == "max_tokens":
            raise OutputTruncatedError(
                f"vertex_claude: response truncated at max_tokens={max_tokens} "
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
