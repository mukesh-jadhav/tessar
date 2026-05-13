"""ResearchPlan schema — output of the `research_planner` agent.

The planner consumes a `NormalizedBrief` + `Requirements` and emits a
small list of prioritized research questions. Each question is later
assigned to one `research_worker` (parallel fan-out, Phase 3.6). Keep
the question count tight (≤8) to bound per-run cost.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

QuestionCategory = Literal[
    "component_choice",
    "pricing",
    "compliance",
    "scaling",
    "integration",
    "security",
    "data_model",
    "operability",
    "general",
]

QuestionPriority = Literal["high", "medium", "low"]


class ResearchQuestion(BaseModel):
    """One concrete question to dispatch to a research worker.

    `keywords` are search hints — the worker uses them to seed Tavily /
    Brave queries. `relates_to` cites FR-/NFR- ids the question is
    answering for, used by the synthesizer to wire findings back to
    requirements.
    """

    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=8, pattern=r"^RQ-\d{1,3}$")
    question: str = Field(min_length=10, max_length=300)
    rationale: str = Field(min_length=10, max_length=300)
    category: QuestionCategory
    priority: QuestionPriority
    keywords: list[str] = Field(min_length=1, max_length=8)
    relates_to: list[str] = Field(default_factory=list, max_length=10)


class ResearchPlan(BaseModel):
    """Full plan emitted by the planner. ``questions`` is bounded so the
    parallel fan-out cannot blow the per-run budget."""

    model_config = ConfigDict(extra="forbid")

    questions: list[ResearchQuestion] = Field(min_length=1, max_length=8)
    notes: str | None = Field(default=None, max_length=600)
