"""Vertex AI Gemini provider — primary chain entry per architecture.instructions.md.

Behaviour:
  - Lazy SDK import: `from google.cloud import aiplatform` is deferred to
    `_lazy_import()` so importing this module never fails on a box without
    the SDK installed (CI/dev). Calling `generate()` without the SDK raises
    a clear `RuntimeError`.
  - Tier -> model mapping is overridable via constructor; defaults match
    the locked stack:
        Tier.A -> gemini-2.5-pro
        Tier.B -> gemini-2.5-flash
        Tier.C -> gemini-2.5-flash-lite
  - 5xx / 429 / DeadlineExceeded -> `TransientProviderError` (router falls
    over to next provider). Anything else bubbles unchanged.
  - Cost estimate uses static per-1k-token rates supplied at construction;
    these are documented in `pricing.py` and refreshed quarterly per the
    KB freshness SLA.

This provider is NOT instantiated by default — see `factory.py` for how
the orchestrator decides whether to wire it in based on env config.
"""

from __future__ import annotations

import logging
from collections.abc import Sequence
from typing import Any

from ..types import LlmMessage, LlmResponse, LlmUsage, Tier
from .base import LlmProvider, TransientProviderError

log = logging.getLogger(__name__)


# Per-1k-token USD pricing (input + output blended for the estimate).
# Refresh whenever Vertex publishes new prices; Phase-3 KB freshness SLA
# applies — bump these and re-baseline evals.
DEFAULT_PRICING_USD_PER_1K: dict[Tier, dict[str, float]] = {
    Tier.A: {"input": 0.00125, "output": 0.005},  # gemini-2.5-pro
    Tier.B: {"input": 0.00015, "output": 0.0006},  # gemini-2.5-flash
    Tier.C: {"input": 0.00005, "output": 0.0002},  # gemini-2.5-flash-lite
}

DEFAULT_MODELS: dict[Tier, str] = {
    Tier.A: "gemini-2.5-pro",
    Tier.B: "gemini-2.5-flash",
    Tier.C: "gemini-2.5-flash-lite",
}


def _lazy_import() -> tuple[Any, Any]:
    """Import the Vertex SDK on first use. Raises a friendly error if
    `google-cloud-aiplatform` isn't installed."""
    try:
        import vertexai  # type: ignore[import-not-found]
        from vertexai.generative_models import GenerativeModel  # type: ignore[import-not-found]
    except ImportError as e:
        raise RuntimeError(
            "vertex_gemini provider requires `google-cloud-aiplatform` + "
            "`vertexai` installed. Add to apps/orchestrator/pyproject.toml "
            "when wiring real LLM calls (Phase 3.3+)."
        ) from e
    return vertexai, GenerativeModel


def _classify_error(exc: BaseException) -> bool:
    """True if the exception should be treated as transient (router retries
    the NEXT provider). We do this by name to avoid hard-importing the
    Google SDK exception module here."""
    name = type(exc).__name__
    transient_names = {
        "ServiceUnavailable",
        "DeadlineExceeded",
        "ResourceExhausted",  # quota / 429
        "InternalServerError",
        "Aborted",
        "Unavailable",
        "GoogleAPICallError",
    }
    return name in transient_names


class VertexGeminiProvider(LlmProvider):
    """Adapter for Vertex AI Gemini.

    Construct with `(project=..., location="asia-south1")`. The SDK reads
    Application Default Credentials from the runtime environment
    (Cloud Run service account in prod; `gcloud auth application-default
    login` locally).
    """

    name = "vertex_gemini"

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
        self._supported = supported_tiers or {Tier.A, Tier.B, Tier.C}
        self._initialised = False

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

    def generate(
        self,
        messages: Sequence[LlmMessage],
        *,
        tier: Tier,
        max_tokens: int,
        temperature: float,
    ) -> LlmResponse:
        vertexai, GenerativeModel = _lazy_import()
        if not self._initialised:
            vertexai.init(project=self._project, location=self._location)
            self._initialised = True

        model_id = self._models[tier]
        model = GenerativeModel(model_id)

        # Vertex's `GenerativeModel.generate_content` takes a single string
        # OR a list of `Content` objects. We flatten the message list into a
        # single prompt with role markers — simple and provider-portable.
        prompt = "\n\n".join(f"<{m.role}>\n{m.content}" for m in messages)

        try:
            result = model.generate_content(
                prompt,
                generation_config={
                    "max_output_tokens": max_tokens,
                    "temperature": temperature,
                },
            )
        except Exception as e:
            if _classify_error(e):
                raise TransientProviderError(f"vertex_gemini: {type(e).__name__}: {e}") from e
            raise

        # Extract text + token usage. The SDK returns a `GenerationResponse`
        # with `.text` and `.usage_metadata.{prompt,candidates,total}_token_count`.
        text = (result.text or "").strip()
        usage_meta = getattr(result, "usage_metadata", None)
        prompt_tokens = int(getattr(usage_meta, "prompt_token_count", 0) or 0)
        completion_tokens = int(getattr(usage_meta, "candidates_token_count", 0) or 0)

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
