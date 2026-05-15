"""Synthesizer output schema.

Each `Decision` represents one architectural pick (e.g. "primary
database", "auth provider"). Every pick MUST cite at least one source —
either a KB record id (`kind="kb"`, `ref="<KbRecord.id>"`) or a research
finding (`kind="finding"`, `ref="<RQ-NN>"`). Ungrounded picks violate
the trust requirement in `.github/instructions/product-goals.instructions.md`
and the agent's retry/error path enforces this.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

DecisionConfidence = Literal["low", "med", "high"]
CitationKind = Literal["kb", "finding"]


class DecisionCitation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: CitationKind
    ref: str = Field(min_length=1, max_length=120)


class AlternativeConsidered(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=200)
    why_not: str = Field(min_length=10, max_length=600)


class Decision(BaseModel):
    """One architectural pick with mandatory citations."""

    model_config = ConfigDict(extra="forbid")

    id: str = Field(pattern=r"^D-\d{1,3}$", min_length=3, max_length=8)
    topic: str = Field(min_length=3, max_length=120)
    pick: str = Field(min_length=2, max_length=200)
    component_id: str | None = Field(default=None, max_length=80)
    rationale: str = Field(min_length=20, max_length=800)
    alternatives: list[AlternativeConsidered] = Field(default_factory=list, max_length=5)
    confidence: DecisionConfidence
    citations: list[DecisionCitation] = Field(min_length=1, max_length=8)


class Synthesis(BaseModel):
    """Full set of architectural decisions for one run."""

    model_config = ConfigDict(extra="forbid")

    decisions: list[Decision] = Field(min_length=1, max_length=20)
    notes: str | None = Field(default=None, max_length=1500)
