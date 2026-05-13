"""Cost estimator output schema (Phase 3.9).

Mirror of the relevant subset of `packages/shared-schemas/index.ts`'s
`BomLine` contract, plus aggregated monthly totals at 1× / 10× / 100×
scale tiers (matches `ScaleTier` from the architect).

Cost numbers are USD/month at the brief's stated baseline scale unless
otherwise noted in `BomLine.assumptions`. The packager later remaps
`BomLine.cite` to numeric `Source.id` indices when it assembles
`RunPackage.sources[]` (same pattern as `Decision.citations` and
`ArchNode.cite`).
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from .synthesis import DecisionCitation

BomKind = Literal["compute", "data", "storage", "network", "vendor"]
Currency = Literal["USD"]


class BomScaleExponent(BaseModel):
    """How `base_cost` scales with traffic.

    A line with `users=1.0` doubles when users double; `rps=0.5`
    sub-linearly tracks RPS (e.g. shared infra). Omit for fixed costs.
    """

    model_config = ConfigDict(extra="forbid")

    users: float | None = Field(default=None, ge=0, le=5)
    rps: float | None = Field(default=None, ge=0, le=5)
    gb: float | None = Field(default=None, ge=0, le=5)


class BomLine(BaseModel):
    """One line in the bill of materials."""

    model_config = ConfigDict(extra="forbid")

    id: str = Field(pattern=r"^B-\d{1,3}$", min_length=3, max_length=8)
    name: str = Field(min_length=2, max_length=120)
    kind: BomKind
    base_cost_usd: float = Field(ge=0, le=1_000_000)
    scale_exp: BomScaleExponent = Field(default_factory=BomScaleExponent)
    fixed: bool = False
    free_tier_pct: float | None = Field(default=None, ge=0, le=100)
    cite: DecisionCitation
    component_id: str | None = Field(default=None, max_length=80)
    assumptions: str = Field(min_length=10, max_length=600)


class CostEstimate(BaseModel):
    """Aggregated bill of materials + scale rollups."""

    model_config = ConfigDict(extra="forbid")

    currency: Currency = "USD"
    lines: list[BomLine] = Field(min_length=1, max_length=30)
    monthly_baseline_usd: float = Field(ge=0, le=10_000_000)
    monthly_at_10x_usd: float = Field(ge=0, le=10_000_000)
    monthly_at_100x_usd: float = Field(ge=0, le=10_000_000)
    notes: str | None = Field(default=None, max_length=1500)
