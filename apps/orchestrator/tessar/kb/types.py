"""KB record schema — orchestrator-side mirror of `kb-seed/_schema.yaml`.

Only the fields the synthesizer + cost_estimator actually read are
mirrored. The full JSON-Schema gate lives in `evals/runners/validate_kb.py`
and runs in CI; this Pydantic mirror exists so agent code can reason
over typed values instead of `dict[str, Any]`.
"""

from __future__ import annotations

from datetime import date

from pydantic import BaseModel, ConfigDict, Field


class KbAlternative(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(min_length=1, max_length=80)
    why_not_default: str = Field(min_length=1, max_length=2000)


class KbSource(BaseModel):
    model_config = ConfigDict(extra="ignore")

    url: str = Field(min_length=4, max_length=2048)
    title: str = Field(min_length=1, max_length=300)
    snapshot_date: date


class KbRecord(BaseModel):
    """One curated component record."""

    model_config = ConfigDict(extra="ignore")

    id: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=200)
    category: str = Field(min_length=1, max_length=120)
    vendor: str = Field(min_length=1, max_length=80)
    cloud: str = Field(min_length=1, max_length=40)
    pricing_model: str = Field(min_length=1, max_length=400)
    baseline_cost_usd_per_month: float | None = None
    baseline_cost_assumptions: str | None = Field(default=None, max_length=2000)
    regions: list[str] = Field(default_factory=list, max_length=20)
    compliance: list[str] = Field(default_factory=list, max_length=20)
    capabilities: list[str] = Field(default_factory=list, max_length=40)
    alternatives: list[KbAlternative] = Field(default_factory=list, max_length=10)
    sources: list[KbSource] = Field(min_length=1, max_length=10)
    last_verified_at: date
    notes: str | None = Field(default=None, max_length=4000)
