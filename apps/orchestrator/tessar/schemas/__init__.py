"""Pydantic mirror of the TS shared-schemas contract.

`brief.py` mirrors `apps/web/lib/runs/create.ts::briefInputSchema`.
`requirements.py` is the output of the `requirements_extractor` agent.
`research_plan.py` is the output of the `research_planner` agent.
`research_findings.py` is the output of the `research_worker` fan-out.
`synthesis.py` is the output of the `synthesizer` agent.
`architecture.py` is the output of the `architect` agent.
`cost.py` is the output of the `cost_estimator` agent.
`risks.py` is the output of the `risk_writer` agent.
`run_package.py` is the TS-shape mirror assembled by the `packager` agent.
"""

from .architecture import (
    ArchEdge,
    Architecture,
    ArchNode,
    DataClass,
    EdgeKind,
    FlowStep,
    MermaidDiagrams,
    ScaleTier,
    ScaleTierLabel,
    Zone,
)
from .brief import (
    BriefGuide,
    BriefInput,
    Budget,
    Cloud,
    Compliance,
    Domain,
    Latency,
    NormalizedBrief,
    NormalizedField,
    Region,
    Scale,
)
from .cost import (
    BomKind,
    BomLine,
    BomScaleExponent,
    CostEstimate,
    Currency,
)
from .requirements import (
    FunctionalReq,
    NfrCategory,
    NonFunctionalReq,
    Priority,
    Requirements,
)
from .research_findings import (
    Citation,
    Confidence,
    KeyPoint,
    ResearchError,
    ResearchFinding,
    ResearchFindings,
)
from .research_plan import (
    QuestionCategory,
    QuestionPriority,
    ResearchPlan,
    ResearchQuestion,
)
from .risks import (
    Risk,
    RiskCategory,
    Risks,
    Severity,
)
from .run_package import (
    Assumption,
    BlastRadius,
    ComponentOption,
    PackageArchEdge,
    PackageArchNode,
    PackageBomLine,
    PackageBomScaleExp,
    PackageDecision,
    PackageFlowStep,
    PackageRequirement,
    PackageRisk,
    PackageScaleTier,
    RequirementSource,
    Reversibility,
    RoadmapItem,
    RunPackage,
    Source,
)
from .synthesis import (
    AlternativeConsidered,
    CitationKind,
    Decision,
    DecisionCitation,
    DecisionConfidence,
    Synthesis,
)

__all__ = [
    "AlternativeConsidered",
    "ArchEdge",
    "ArchNode",
    "Architecture",
    "Assumption",
    "BlastRadius",
    "BomKind",
    "BomLine",
    "BomScaleExponent",
    "BriefGuide",
    "BriefInput",
    "Budget",
    "Citation",
    "CitationKind",
    "Cloud",
    "Compliance",
    "ComponentOption",
    "Confidence",
    "CostEstimate",
    "Currency",
    "DataClass",
    "Decision",
    "DecisionCitation",
    "DecisionConfidence",
    "Domain",
    "EdgeKind",
    "FlowStep",
    "FunctionalReq",
    "KeyPoint",
    "Latency",
    "MermaidDiagrams",
    "NfrCategory",
    "NonFunctionalReq",
    "NormalizedBrief",
    "NormalizedField",
    "PackageArchEdge",
    "PackageArchNode",
    "PackageBomLine",
    "PackageBomScaleExp",
    "PackageDecision",
    "PackageFlowStep",
    "PackageRequirement",
    "PackageRisk",
    "PackageScaleTier",
    "Priority",
    "QuestionCategory",
    "QuestionPriority",
    "Region",
    "RequirementSource",
    "Requirements",
    "ResearchError",
    "ResearchFinding",
    "ResearchFindings",
    "ResearchPlan",
    "ResearchQuestion",
    "Reversibility",
    "Risk",
    "RiskCategory",
    "Risks",
    "RoadmapItem",
    "RunPackage",
    "Scale",
    "ScaleTier",
    "ScaleTierLabel",
    "Severity",
    "Source",
    "Synthesis",
    "Zone",
]
