"""RunPackage — TS-shape mirror of the locked `RunPackage` contract in
`packages/shared-schemas/index.ts`. Phase 3.11 packager assembles this
from upstream agent outputs.

This is the **TS-facing** projection: field names use camelCase to match
the JS consumer; citations are 1-based ints into `sources[]` (not the
`DecisionCitation` shape used internally by the synthesizer/architect/
cost_estimator/risk_writer). The packager is the boundary that performs
that remap.

ADR-0004 locks the contract; ADR-0008 gates the eval rubric.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from .architecture import (
    DataClass,
    DeliverySemantics,
    EdgeKind,
    IntegrationMode,
    ScaleTier,
    ScaleTierLabel,
    SequenceKind,
    Zone,
)
from .cost import BomKind
from .risks import Severity
from .synthesis import DecisionConfidence

Reversibility = Literal["1-way", "2-way"]
BlastRadius = Literal["service", "data", "platform"]
RequirementSource = Literal["brief", "clarify", "default"]


class _TsModel(BaseModel):
    """Strict, TS-shape model: rejects unknown fields, accepts both
    snake_case (for Python construction) and camelCase (round-trip JSON).

    `model_dump(by_alias=True)` produces the TS-shape JSON that
    `apps/web` reads.
    """

    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
    )


class Source(_TsModel):
    """One numbered citation row. `id` is 1-based; cite ints elsewhere
    in the package index into this list."""

    id: int = Field(ge=1)
    title: str = Field(min_length=1, max_length=300)
    publisher: str = Field(default="", max_length=200)
    url: str = Field(min_length=1, max_length=2048)
    verified_at: str = Field(min_length=1, max_length=40, alias="verifiedAt")


class PackageRequirement(_TsModel):
    id: str = Field(min_length=1, max_length=40)
    label: str = Field(min_length=1, max_length=120)
    value: str = Field(min_length=1, max_length=600)
    source: RequirementSource


class Assumption(_TsModel):
    id: str = Field(min_length=1, max_length=40)
    text: str = Field(min_length=1, max_length=600)
    basis: str = Field(min_length=1, max_length=400)
    override: str | None = Field(default=None, max_length=400)


class PackageDecision(_TsModel):
    id: str
    topic: str
    pick: str
    vs: str = Field(default="", max_length=400)
    why: str
    conf: DecisionConfidence
    cite: int = Field(ge=1)
    reversibility: Reversibility
    blast_radius: BlastRadius = Field(alias="blastRadius")
    revisit_at: str = Field(min_length=1, max_length=200, alias="revisitAt")


class PackageBomScaleExp(_TsModel):
    users: float | None = None
    rps: float | None = None
    gb: float | None = None


class PackageBomLine(_TsModel):
    id: str
    name: str
    kind: BomKind
    base_cost: float = Field(ge=0, alias="baseCost")
    scale_exp: PackageBomScaleExp | None = Field(default=None, alias="scaleExp")
    fixed: bool | None = None
    free_tier_pct: float | None = Field(default=None, ge=0, le=100, alias="freeTierPct")
    cite: int = Field(ge=1)


class PackageRisk(_TsModel):
    id: str
    title: str
    body: str
    severity: Severity
    likelihood: Severity
    mitigation: str
    cite: int = Field(ge=1)


class RoadmapItem(_TsModel):
    id: str
    title: str = Field(min_length=1, max_length=200)
    when: str = Field(min_length=1, max_length=80)
    body: str = Field(min_length=1, max_length=600)


class PackageScaleTier(_TsModel):
    tier: ScaleTierLabel
    note: str


class PackageArchNode(_TsModel):
    """TS-shape mirror of `ArchNode`. Differs from orchestrator
    `ArchNode` only in (a) `cite: int` instead of `DecisionCitation`,
    (b) camelCase field names on JSON wire, (c) `appearsAt` field
    populated by the packager from the architect's phase mapping."""

    id: str
    label: str
    sub: str
    zone: Zone
    icon: str
    cite: int = Field(ge=1)
    data_class: DataClass = Field(alias="dataClass")
    failure_domain: list[str] = Field(default_factory=list, alias="failureDomain")
    why: str
    scale: list[ScaleTier] = Field(min_length=3, max_length=3)
    alts: str = ""
    scale_chip: str | None = Field(default=None, alias="scaleChip")
    appears_at: str | None = Field(default=None, alias="appearsAt")
    x: float
    y: float
    w: float


class PackageArchEdge(_TsModel):
    """TS-shape mirror of `ArchEdge`. `src` serializes as `"from"` (TS
    keyword)."""

    src: str = Field(alias="from")
    to: str
    kind: EdgeKind
    label: str | None = None
    curve: float | None = None
    appears_at: str | None = Field(default=None, alias="appearsAt")
    qps: str | None = None
    p95: str | None = None
    retry: str | None = None
    payload: str | None = None


class ComponentOption(_TsModel):
    id: str
    label: str
    sub: str = ""
    note: str = ""
    cost_mul: float = Field(default=1.0, ge=0, alias="costMul")
    remove: bool | None = None


class PackageFlowStep(_TsModel):
    id: str
    title: str
    nodes: list[str]
    body: str


class PackageSequenceDiagram(_TsModel):
    """ADR-0006 sequence diagram (write/read/async)."""

    id: str
    kind: SequenceKind
    title: str
    summary: str
    participants: list[str]
    mermaid: str


class PackageIntegrationContract(_TsModel):
    """ADR-0006 integration contract (per critical edge)."""

    edge_id: str = Field(alias="edgeId")
    src: str = Field(alias="from")
    to: str
    mode: IntegrationMode
    payload: str
    idempotency: str
    retry: str
    semantics: DeliverySemantics
    cite: int = Field(ge=1)


class PackageComponentRationale(_TsModel):
    """ADR-0006 \"fits because\" link from one node to one requirement."""

    node_id: str = Field(alias="nodeId")
    requirement_id: str = Field(alias="requirementId")
    narrative: str
    cite: int = Field(ge=1)


class PackageFailureMode(_TsModel):
    """ADR-0006 per-node failure mode entry."""

    id: str
    node_id: str = Field(alias="nodeId")
    mode: str
    detection: str
    recovery: str
    rto: str
    rpo: str
    cite: int = Field(ge=1)


class PackageBuildPhase(_TsModel):
    """ADR-0006 phased build sequence step."""

    id: str
    label: str
    title: str
    nodes: list[str]
    rationale: str


class RunPackage(_TsModel):
    """Complete contract emitted by the packager. JSON serialization with
    `by_alias=True` produces the exact shape the web app consumes.

    ADR-0006 fields (`sequence_diagrams`, `integration_contracts`,
    `component_rationales`, `failure_modes`, `build_sequence`) are
    optional during rollout; once the architect/synthesizer prompts emit
    them, flip to required in the same PR.
    """

    id: str
    generated_at: str = Field(alias="generatedAt")
    kb_snapshot_id: str = Field(min_length=1, max_length=80, alias="kbSnapshotId")

    brief: str
    requirements: list[PackageRequirement]
    assumptions: list[Assumption]

    nodes: list[PackageArchNode]
    edges: list[PackageArchEdge]
    component_options: dict[str, list[ComponentOption]] = Field(
        default_factory=dict, alias="componentOptions"
    )

    decisions: list[PackageDecision]
    bom: list[PackageBomLine]
    risks: list[PackageRisk]
    roadmap: list[RoadmapItem]

    flow_narrative: list[PackageFlowStep] = Field(alias="flowNarrative")
    sequence_diagrams: list[PackageSequenceDiagram] = Field(
        default_factory=list, alias="sequenceDiagrams"
    )
    integration_contracts: list[PackageIntegrationContract] = Field(
        default_factory=list, alias="integrationContracts"
    )
    component_rationales: list[PackageComponentRationale] = Field(
        default_factory=list, alias="componentRationales"
    )
    failure_modes: list[PackageFailureMode] = Field(default_factory=list, alias="failureModes")
    build_sequence: list[PackageBuildPhase] = Field(default_factory=list, alias="buildSequence")
    sources: list[Source]
