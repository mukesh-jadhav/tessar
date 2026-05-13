"""TESSAR LLM layer.

Public surface (stable; agent code imports only from here):

    from tessar.llm import (
        LlmRouter, LlmMessage, LlmResponse, LlmUsage, Tier,
        BudgetTracker, BudgetExceeded,
        TIER_FOR_AGENT,
    )

Internal modules (`providers/*`, `tier_policy`, `budget`) may move; the
public surface above is the only thing other code is allowed to depend on.

Design notes (locked by `architecture.instructions.md`):
  - Tier-A (frontier) for synthesizer / architect / risk_writer
  - Tier-B (mid)      for research workers / requirements_extractor
  - Tier-C (cheap)    for classification / intake_normalizer / source dedup
  - Provider routing: Vertex Gemini -> Vertex Claude -> OpenAI direct.
  - Fallback only on quota / 5xx / network errors. NOT on validation failures.
  - Per-run hard token + USD budget enforced by `BudgetTracker`; over-budget
    raises `BudgetExceeded` and the caller must abort + refund + alert.
"""

from .budget import BudgetExceeded, BudgetTracker
from .router import LlmRouter
from .tier_policy import TIER_FOR_AGENT
from .types import LlmMessage, LlmResponse, LlmUsage, Tier

__all__ = [
    "TIER_FOR_AGENT",
    "BudgetExceeded",
    "BudgetTracker",
    "LlmMessage",
    "LlmResponse",
    "LlmRouter",
    "LlmUsage",
    "Tier",
]
