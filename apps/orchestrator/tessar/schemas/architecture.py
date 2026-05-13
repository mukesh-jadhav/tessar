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


class MermaidDiagrams(BaseModel):
    """The three diagrams the packager renders to SVG/PNG via mermaid-cli."""

    model_config = ConfigDict(extra="forbid")

    c4: str = Field(min_length=20, max_length=8000)
    data_flow: str = Field(min_length=20, max_length=8000)
    sequence: str = Field(min_length=20, max_length=8000)


class Architecture(BaseModel):
    """Full architect output for one run."""

    model_config = ConfigDict(extra="forbid")

    nodes: list[ArchNode] = Field(min_length=4, max_length=30)
    edges: list[ArchEdge] = Field(min_length=3, max_length=60)
    flows: list[FlowStep] = Field(min_length=1, max_length=6)
    diagrams: MermaidDiagrams
    notes: str | None = Field(default=None, max_length=1500)
