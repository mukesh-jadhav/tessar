"""Architect output schema.

Mirror of the relevant subset of `packages/shared-schemas/index.ts`'s
`ArchNode` / `ArchEdge` / `FlowStep` contract, plus the three Mermaid
diagrams the architect emits per `MVP.md` §3.4 (C4 container, data-flow,
one sequence diagram). The packager later rolls these into the final
`RunPackage`.

Citation grounding mirrors the synthesizer: each node carries a
`DecisionCitation` (kind="kb"|"finding") that the agent module's
admissibility check rejects if it points outside the supplied KB +
returned-finding universe. The packager remaps these to numeric
`Source.id` indices when it assembles `RunPackage.sources[]`.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from .synthesis import DecisionCitation

Zone = Literal["client", "edge", "app", "data", "external"]
DataClass = Literal["public", "internal", "confidential", "regulated"]
EdgeKind = Literal["sync", "async", "data", "external"]
ScaleTierLabel = Literal["1×", "10×", "100×"]


class ScaleTier(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tier: ScaleTierLabel
    note: str = Field(min_length=4, max_length=300)


class ArchNode(BaseModel):
    """One architecture component."""

    model_config = ConfigDict(extra="forbid")

    id: str = Field(pattern=r"^N-\d{1,3}$", min_length=3, max_length=8)
    label: str = Field(min_length=2, max_length=80)
    sub: str = Field(min_length=2, max_length=120)
    zone: Zone
    icon: str = Field(min_length=1, max_length=60)
    cite: DecisionCitation
    data_class: DataClass
    failure_domain: list[str] = Field(default_factory=list, max_length=10)
    why: str = Field(min_length=20, max_length=800)
    scale: list[ScaleTier] = Field(min_length=3, max_length=3)
    alts: str = Field(default="", max_length=300)
    scale_chip: str | None = Field(default=None, max_length=60)
    x: float = Field(ge=0, le=100)
    y: float = Field(ge=0, le=100)
    w: float = Field(gt=0, le=100)


class ArchEdge(BaseModel):
    """One architecture edge.

    `src` is serialized as `"from"` to match the TS contract; `from` is
    a Python reserved keyword so the Python field is renamed and aliased.
    """

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    src: str = Field(alias="from", min_length=3, max_length=8)
    to: str = Field(min_length=3, max_length=8)
    kind: EdgeKind
    label: str | None = Field(default=None, max_length=80)
    qps: str | None = Field(default=None, max_length=40)
    p95: str | None = Field(default=None, max_length=40)
    retry: str | None = Field(default=None, max_length=80)
    payload: str | None = Field(default=None, max_length=120)


class FlowStep(BaseModel):
    """One step in the request-lifecycle explainer."""

    model_config = ConfigDict(extra="forbid")

    id: str = Field(pattern=r"^F-\d{1,3}$", min_length=3, max_length=8)
    title: str = Field(min_length=3, max_length=120)
    nodes: list[str] = Field(min_length=1, max_length=12)
    body: str = Field(min_length=40, max_length=800)


SequenceKind = Literal["write", "read", "async"]
IntegrationMode = Literal["sync", "async"]
DeliverySemantics = Literal["at-least-once", "exactly-once", "best-effort"]


class SequenceDiagram(BaseModel):
    """One Mermaid `sequenceDiagram` source + metadata. ADR-0006: the
    architect emits exactly three (one per `SequenceKind`)."""

    model_config = ConfigDict(extra="forbid")

    id: str = Field(pattern=r"^SEQ-(write|read|async)$", min_length=8, max_length=10)
    kind: SequenceKind
    title: str = Field(min_length=3, max_length=120)
    summary: str = Field(min_length=20, max_length=600)
    participants: list[str] = Field(min_length=2, max_length=12)
    mermaid: str = Field(min_length=40, max_length=8000)


class IntegrationContract(BaseModel):
    """Wire-level agreement at one edge. ADR-0006."""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    edge_id: str = Field(min_length=3, max_length=120, alias="edgeId")
    src: str = Field(alias="from", min_length=3, max_length=8)
    to: str = Field(min_length=3, max_length=8)
    mode: IntegrationMode
    payload: str = Field(min_length=4, max_length=400)
    idempotency: str = Field(min_length=4, max_length=400)
    retry: str = Field(min_length=4, max_length=400)
    semantics: DeliverySemantics
    cite: DecisionCitation


class ComponentRationale(BaseModel):
    """\"Fits because\" link from one architect pick to one requirement.
    ADR-0006.
    """

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    node_id: str = Field(pattern=r"^N-\d{1,3}$", min_length=3, max_length=8, alias="nodeId")
    requirement_id: str = Field(min_length=1, max_length=40, alias="requirementId")
    narrative: str = Field(min_length=40, max_length=1200)
    cite: DecisionCitation


class FailureMode(BaseModel):
    """One row in the per-node failure-modes table (ADR-0006).

    Architect emits one entry per `ArchNode` whose `failure_domain` has
    at least one member (i.e. nodes the architect already flagged as
    architecturally consequential).
    """

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    id: str = Field(pattern=r"^FM-\d{1,3}$", min_length=4, max_length=8)
    node_id: str = Field(pattern=r"^N-\d{1,3}$", min_length=3, max_length=8, alias="nodeId")
    mode: str = Field(min_length=4, max_length=160)
    detection: str = Field(min_length=10, max_length=600)
    recovery: str = Field(min_length=10, max_length=800)
    rto: str = Field(min_length=2, max_length=60)
    rpo: str = Field(min_length=2, max_length=60)
    cite: DecisionCitation


class BuildPhase(BaseModel):
    """One phase of the engineering build sequence (ADR-0006).

    Distinct from `RoadmapItem` (product roadmap); this is the
    week-1/week-2/week-3 ordering of which `ArchNode`s to stand up
    first.
    """

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    id: str = Field(pattern=r"^BP-\d{1,2}$", min_length=4, max_length=6)
    label: str = Field(min_length=2, max_length=60)
    title: str = Field(min_length=4, max_length=160)
    nodes: list[str] = Field(min_length=1, max_length=30)
    rationale: str = Field(min_length=20, max_length=600)


class MermaidDiagrams(BaseModel):
    """C4 + data-flow Mermaid sources.

    `sequence` is the legacy single sequence diagram. ADR-0006 supersedes
    it with `Architecture.sequence_diagrams` (three: write/read/async).
    Kept optional during rollout so older golden fixtures still validate.
    """

    model_config = ConfigDict(extra="forbid")

    c4: str = Field(min_length=20, max_length=8000)
    data_flow: str = Field(min_length=20, max_length=8000)
    sequence: str | None = Field(default=None, min_length=20, max_length=8000)


class Architecture(BaseModel):
    """Full architect output for one run.

    ADR-0006 fields (`sequence_diagrams`, `integration_contracts`,
    `component_rationales`) are optional during rollout. Once the
    architect prompt v2 lands and the agent admissibility checks enforce
    them, flip these to required in the same PR that ships v2.
    """

    model_config = ConfigDict(extra="forbid")

    nodes: list[ArchNode] = Field(min_length=4, max_length=30)
    edges: list[ArchEdge] = Field(min_length=3, max_length=60)
    flows: list[FlowStep] = Field(min_length=1, max_length=6)
    diagrams: MermaidDiagrams
    sequence_diagrams: list[SequenceDiagram] = Field(default_factory=list, max_length=3)
    integration_contracts: list[IntegrationContract] = Field(default_factory=list, max_length=20)
    component_rationales: list[ComponentRationale] = Field(default_factory=list, max_length=20)
    failure_modes: list[FailureMode] = Field(default_factory=list, max_length=30)
    build_sequence: list[BuildPhase] = Field(default_factory=list, max_length=8)
    notes: str | None = Field(default=None, max_length=1500)
