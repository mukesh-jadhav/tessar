"""Build an `LlmRouter` from runtime settings.

Keeps the router-construction policy (which providers, in what order,
with what budget) in ONE place so agents can just call
`build_router(run_id=...)` and not care about the chain.

Provider chain (per architecture.instructions.md):
    Vertex Gemini  →  Vertex Claude  →  OpenAI direct

In dev / CI, when `VERTEX_PROJECT` is unset, the chain collapses to a
single `MockLlmProvider`. This is the path the unit tests exercise.
"""

from __future__ import annotations

import logging

from tessar.config import settings

from .budget import BudgetTracker
from .providers.base import LlmProvider
from .providers.mock import MockLlmProvider
from .router import LlmRouter

log = logging.getLogger(__name__)


def _build_provider_chain() -> list[LlmProvider]:
    """Assemble the provider chain. Real providers are added only when
    their config is present so a missing SDK never breaks startup."""
    chain: list[LlmProvider] = []

    if settings.vertex_project:
        try:
            from .providers.vertex_gemini import VertexGeminiProvider

            chain.append(
                VertexGeminiProvider(
                    project=settings.vertex_project,
                    location=settings.vertex_location,
                )
            )
        except Exception as e:  # SDK missing, auth failure, etc.
            log.warning("llm.vertex_gemini_unavailable err=%s", e)

    # TODO Phase 3.4: Vertex Claude provider
    # TODO Phase 3.4: OpenAI direct provider (last-resort)

    if not chain:
        # Dev / CI default: deterministic mock so the run loop works
        # without cloud creds. Logs loudly so production can't accidentally
        # ship with no real provider.
        log.warning("llm.using_mock_provider — no real provider configured")
        chain.append(MockLlmProvider())

    return chain


def build_router() -> LlmRouter:
    """Construct one router for one run. The budget tracker is per-run
    so each run gets a fresh ceiling."""
    budget = BudgetTracker(
        cap_usd=settings.llm_cap_usd_per_run,
        cap_tokens=settings.llm_cap_tokens_per_run,
    )
    return LlmRouter(_build_provider_chain(), budget)
