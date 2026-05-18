"""Build an `LlmRouter` from runtime settings.

Keeps the router-construction policy (which providers, in what order,
with what budget) in ONE place so agents can just call
`build_router(run_id=...)` and not care about the chain.

Provider chain (per ADR-0015 + architecture.instructions.md):
    Tier-A  : Vertex Claude (Sonnet 4.5) → Vertex Gemini → OpenAI direct
    Tier-B/C: Vertex Gemini (Flash / Flash-Lite) → OpenAI direct

Mechanism: each provider opts in to specific tiers via `supports(tier)`.
The router filters the chain per call, so a single ordered chain
[Claude(A only), Gemini(A/B/C), OpenAI(A/B/C)] gives the right primary
for every tier with no per-tier wiring needed in the router.

In dev / CI, when `VERTEX_PROJECT` is unset, the chain collapses to a
single `MockLlmProvider`. This is the path the unit tests exercise.
"""

from __future__ import annotations

import logging

from tessar.config import settings

from .budget import BudgetTracker
from .cache import PromptCache, build_prompt_cache
from .providers.base import LlmProvider
from .providers.mock import MockLlmProvider
from .router import LlmRouter
from .types import Tier

log = logging.getLogger(__name__)


def _build_provider_chain() -> list[LlmProvider]:
    """Assemble the provider chain. Real providers are added only when
    their config is present so a missing SDK never breaks startup.

    Order matters — per ADR-0015 Claude goes FIRST so the router picks it
    for Tier-A. Gemini is restricted to {A,B,C} (default) and serves as
    Tier-A fallback + Tier-B/C primary (Claude is skipped for B/C via its
    own `supported_tiers={Tier.A}`).
    """
    chain: list[LlmProvider] = []

    # 1. Vertex Claude — Tier-A primary (per ADR-0015).
    if settings.vertex_project:
        try:
            from .providers.vertex_claude import VertexClaudeProvider

            chain.append(
                VertexClaudeProvider(
                    project=settings.vertex_project,
                    location=settings.vertex_location,
                    # Default `supported_tiers={Tier.A}` — Claude only
                    # serves Tier-A. Tier-B/C falls through to Gemini.
                )
            )
        except Exception as e:  # SDK missing, auth failure, etc.
            log.warning("llm.vertex_claude_unavailable err=%s", e)

    # 2. Vertex Gemini — Tier-A fallback + Tier-B/C primary.
    if settings.vertex_project:
        try:
            from .providers.vertex_gemini import VertexGeminiProvider

            chain.append(
                VertexGeminiProvider(
                    project=settings.vertex_project,
                    location=settings.vertex_location,
                    supported_tiers={Tier.A, Tier.B, Tier.C},
                )
            )
        except Exception as e:  # SDK missing, auth failure, etc.
            log.warning("llm.vertex_gemini_unavailable err=%s", e)

    # 3. OpenAI direct — last-resort fallback for all tiers (ADR-0015).
    #    Only wired when the API key is configured (Secret Manager in prod).
    if settings.openai_api_key:
        try:
            from .providers.openai_direct import OpenAIDirectProvider

            chain.append(
                OpenAIDirectProvider(
                    api_key=settings.openai_api_key,
                    base_url=settings.openai_base_url,
                    # Default supported_tiers={A,B,C} — fallback for everyone.
                )
            )
        except Exception as e:  # SDK missing, auth failure, etc.
            log.warning("llm.openai_direct_unavailable err=%s", e)

    if not chain:
        # Dev / CI default: deterministic mock so the run loop works
        # without cloud creds. Logs loudly so production can't accidentally
        # ship with no real provider.
        log.warning("llm.using_mock_provider — no real provider configured")
        chain.append(MockLlmProvider())

    return chain


def build_router(
    *,
    kb_snapshot_id: str | None = None,
    cache: PromptCache | None = None,
) -> LlmRouter:
    """Construct one router for one run. The budget tracker is per-run
    so each run gets a fresh ceiling.

    `kb_snapshot_id` participates in every cache key, so a KB refresh
    naturally invalidates stale cached answers. Pass the snapshot id
    that was used to build the retrieval context for this run.

    `cache` overrides the default `build_prompt_cache()` (Redis when
    `REDIS_URL` is set, else in-process LRU). Tests pass a
    `MemoryPromptCache` directly; production passes nothing and gets the
    Redis-backed default.
    """
    budget = BudgetTracker(
        cap_usd=settings.llm_cap_usd_per_run,
        cap_tokens=settings.llm_cap_tokens_per_run,
    )
    resolved_cache = cache if cache is not None else build_prompt_cache()
    return LlmRouter(
        _build_provider_chain(),
        budget,
        cache=resolved_cache,
        kb_snapshot_id=kb_snapshot_id,
    )
