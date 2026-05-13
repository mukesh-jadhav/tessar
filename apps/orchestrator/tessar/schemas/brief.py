"""Pydantic mirror of the web brief input + the orchestrator's
normalized brief shape.

`BriefInput` mirrors `briefInputSchema` in
`apps/web/lib/runs/create.ts`. Keep the two in lockstep manually until
JSON-Schema codegen lands (Phase 4 chore).

`NormalizedBrief` is the structured output of the `intake_normalizer`
agent (locked Tier-C). It feeds every downstream node — fields are
intentionally narrow enums so the architect / cost_estimator can switch
on them without further normalization.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

# ─── Brief input (mirrors web Zod schema) ───────────────────────


Domain = Literal["b2b", "b2c", "marketplace", "data", "internal", "other"]
Scale = Literal["small", "growing", "large", "huge"]
Region = Literal["us", "eu", "asia", "global"]
Cloud = Literal["any", "gcp", "aws", "azure"]
Compliance = Literal["none", "gdpr", "hipaa", "soc2", "pci"]
Latency = Literal["relaxed", "standard", "tight"]
Budget = Literal["lean", "standard", "generous"]


class BriefGuide(BaseModel):
    """Wizard answers from `/brief`. All optional."""

    model_config = ConfigDict(extra="forbid")

    domain: Domain | None = None
    scale: Scale | None = None
    region: Region | None = None
    cloud: Cloud | None = None
    compliance: Compliance | None = None
    latency: Latency | None = None
    budget: Budget | None = None


class BriefInput(BaseModel):
    """Free-text brief + optional wizard answers. Lower bound on `brief`
    matches the UI submit threshold; upper bound prevents accidental
    pasting of huge docs."""

    model_config = ConfigDict(extra="forbid")

    brief: str = Field(min_length=80, max_length=20_000)
    guide: BriefGuide = Field(default_factory=BriefGuide)


# ─── Normalized brief (intake_normalizer output) ────────────────


FieldSource = Literal["guide", "brief", "default"]


class NormalizedField(BaseModel):
    """Provenance wrapper. Records whether the value came from the
    wizard, was inferred from the brief text, or is a default."""

    model_config = ConfigDict(extra="forbid")

    value: str
    source: FieldSource


class NormalizedBrief(BaseModel):
    """Structured restatement of the user brief.

    Every downstream agent reads from this; do not add free-text fields
    that downstream nodes have to re-parse. Add a typed enum instead.
    """

    model_config = ConfigDict(extra="forbid")

    # 1–2 sentence neutral restatement; used in the package header.
    summary: str = Field(min_length=20, max_length=600)

    # Core classifiers — narrow enums so downstream code can switch on them.
    domain: Domain
    scale: Scale
    region: Region
    cloud: Cloud
    compliance: list[Compliance] = Field(default_factory=list)
    latency: Latency
    budget: Budget

    # Hard constraints lifted from the brief (≤ 10, each ≤ 200 chars).
    key_constraints: list[str] = Field(default_factory=list, max_length=10)

    # Field-by-field provenance for the audit tab.
    provenance: dict[str, FieldSource] = Field(default_factory=dict)
