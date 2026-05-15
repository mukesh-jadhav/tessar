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


FailureSeverity = Literal["low", "med", "high", "critical"]


class FailureMode(BaseModel):
    """One identified failure mode for a critical pick (ADR-0006).

    `decision_id` ties the failure to a `Decision.id`; the agent must
    only emit failure modes for decisions that exist in the same run.
    """

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    id: str = Field(pattern=r"^FM-\d{1,3}$", min_length=4, max_length=8)
    decision_id: str = Field(pattern=r"^D-\d{1,3}$", min_length=3, max_length=8, alias="decisionId")
    title: str = Field(min_length=4, max_length=160)
    trigger: str = Field(min_length=10, max_length=600)
    blast_radius: str = Field(min_length=10, max_length=400, alias="blastRadius")
    detection: str = Field(min_length=10, max_length=600)
    mitigation: str = Field(min_length=10, max_length=800)
    severity: FailureSeverity
    cite: DecisionCitation


class BuildPhase(BaseModel):
    """One phase of the phased build sequence (ADR-0006). Mirrors the
    1× → 10× → 100× → multi-region progression the architect's `scale`
    array hints at, but expressed as concrete build milestones."""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    id: str = Field(pattern=r"^BP-\d{1,2}$", min_length=4, max_length=6)
    order: int = Field(ge=1, le=20)
    label: str = Field(min_length=2, max_length=60)
    summary: str = Field(min_length=20, max_length=600)
    components: list[str] = Field(min_length=1, max_length=30)
    exit_criteria: str = Field(min_length=20, max_length=600, alias="exitCriteria")


class Synthesis(BaseModel):
    """Full set of architectural decisions for one run.

    `failure_modes` and `build_sequence` are ADR-0006 additions, optional
    during rollout. Once the synthesizer prompt v2 lands and emits them,
    flip both to required in the same PR.
    """

    model_config = ConfigDict(extra="forbid")

    decisions: list[Decision] = Field(min_length=1, max_length=20)
    failure_modes: list[FailureMode] = Field(default_factory=list, max_length=20)
    build_sequence: list[BuildPhase] = Field(default_factory=list, max_length=8)
    notes: str | None = Field(default=None, max_length=1500)
