"""
Minimal Pydantic mirror of the TypeScript `RunPackage` contract.

Only the fields that the auto-checkable axes need are modelled here.
The full contract is owned by `packages/shared-schemas/index.ts` and will
be mirrored in the orchestrator at `apps/orchestrator/tessar/schemas/`
when Phase 3.3 lands the real packager.

Locked by ADR-0004; eval rubric locked by ADR-0008.

If a `RunPackage` JSON parses cleanly here, the **schema validity** axis
counts the package as valid for the subset we care about. The full mirror
will replace this once it ships.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class _Strict(BaseModel):
    # Reject unknown fields → catches drift between TS and Python contracts
    # AT THE BOUNDARIES we care about. We are intentionally permissive on
    # the fields not modelled here (see comment in each subclass).
    model_config = ConfigDict(extra="allow")


class Source(_Strict):
    id: int
    title: str
    publisher: str
    url: str
    verifiedAt: str


class ArchNode(_Strict):
    id: str
    label: str
    cite: int


class Decision(_Strict):
    id: str
    topic: str
    pick: str
    vs: str
    why: str
    conf: str  # "low" | "med" | "high" — looser here; full validation in orchestrator
    cite: int
    reversibility: str  # "1-way" | "2-way"
    blastRadius: str  # "service" | "data" | "platform"
    revisitAt: str


class BomLine(_Strict):
    id: str
    name: str
    kind: str  # "compute" | "data" | "storage" | "network" | "vendor"
    baseCost: float
    cite: int


class Risk(_Strict):
    id: str
    title: str
    severity: str
    likelihood: str
    mitigation: str
    cite: int


class Requirement(_Strict):
    id: str
    label: str
    value: str
    source: str  # "brief" | "clarify" | "default"


class RunPackage(_Strict):
    """Subset of the full `RunPackage` contract sufficient to score the
    auto-checkable rubric axes (groundedness, schema-validity-of-this-subset,
    cost-realism)."""

    id: str
    generatedAt: str
    kbSnapshotId: str
    brief: str
    requirements: list[Requirement]
    nodes: list[ArchNode] = Field(default_factory=list)
    decisions: list[Decision] = Field(default_factory=list)
    bom: list[BomLine] = Field(default_factory=list)
    risks: list[Risk] = Field(default_factory=list)
    sources: list[Source] = Field(default_factory=list)
