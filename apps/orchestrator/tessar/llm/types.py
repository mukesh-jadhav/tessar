"""Public types for the LLM layer.

Pydantic models — no Vertex / Anthropic / OpenAI SDK imports here. Provider
adapters are responsible for translating to/from these types.
"""

from __future__ import annotations

from enum import Enum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, NonNegativeInt


class Tier(str, Enum):
    """LLM tier per `architecture.instructions.md`.

    A = frontier (synthesizer, architect, risk_writer)
    B = mid     (research workers, requirements_extractor)
    C = cheap   (classification, intake_normalizer, source dedup)
    """

    A = "A"
    B = "B"
    C = "C"


class LlmMessage(BaseModel):
    """Wire-level message. Provider adapters map roles 1:1."""

    model_config = ConfigDict(extra="forbid")

    role: Literal["system", "user", "assistant"]
    content: str


class LlmUsage(BaseModel):
    """Token + cost accounting for a single call."""

    model_config = ConfigDict(extra="forbid")

    prompt_tokens: NonNegativeInt
    completion_tokens: NonNegativeInt
    cost_usd: float = Field(ge=0.0)

    @property
    def total_tokens(self) -> int:
        return self.prompt_tokens + self.completion_tokens


class LlmResponse(BaseModel):
    """One completion. `provider` + `model` are recorded for the audit tab."""

    model_config = ConfigDict(extra="forbid")

    text: str
    provider: str
    model: str
    tier: Tier
    usage: LlmUsage
