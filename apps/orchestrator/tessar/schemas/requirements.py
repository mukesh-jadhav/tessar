"""Requirements schema — output of the `requirements_extractor` agent.

Consumes a `NormalizedBrief`, produces a structured list of functional
+ non-functional requirements, plus personas, out-of-scope, assumptions,
and up to three open questions. Every downstream node (research_planner,
synthesizer, architect, cost_estimator, risk_writer, packager) reads
from this — keep fields narrow + typed.

The "≤3 clarify questions" rule from `product-goals.instructions.md`
is surfaced through `open_questions`. The runner does NOT pause for
user answers in MVP; the questions land in the final package's open-
questions section so the user can address them in a re-run later.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

# ─── enums ──────────────────────────────────────────────────────

Priority = Literal["must", "should", "could", "wont"]

NfrCategory = Literal[
    "performance",
    "scalability",
    "security",
    "reliability",
    "cost",
    "observability",
    "compliance",
    "data",
    "operability",
]

# ─── leaf models ────────────────────────────────────────────────


class FunctionalReq(BaseModel):
    """One functional requirement. Convention: id like ``FR-01``,
    ``FR-02``…  IDs are stable per run so downstream nodes can cite
    them (e.g. the architect explaining which component satisfies which
    requirement)."""

    model_config = ConfigDict(extra="forbid")

    # Loosely validated; prompt enforces the FR-NN convention.
    id: str = Field(min_length=1, max_length=16, pattern=r"^[A-Z]{1,4}-\d{1,4}$")
    title: str = Field(min_length=3, max_length=120)
    description: str = Field(min_length=10, max_length=600)
    priority: Priority


class NonFunctionalReq(BaseModel):
    """One non-functional requirement. ``target`` is the measurable
    expression where one exists (e.g. ``"p95 < 200ms"``,
    ``"99.9% monthly uptime"``); leave ``None`` when the brief is
    qualitative only."""

    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=16, pattern=r"^[A-Z]{1,4}-\d{1,4}$")
    category: NfrCategory
    statement: str = Field(min_length=5, max_length=300)
    target: str | None = Field(default=None, max_length=200)


# ─── top-level Requirements ─────────────────────────────────────


class Requirements(BaseModel):
    """Structured requirements set. The architect + cost_estimator switch
    on ``non_functional[].category`` and ``priority`` heavily — keep
    those enums tight."""

    model_config = ConfigDict(extra="forbid")

    functional: list[FunctionalReq] = Field(min_length=1, max_length=30)
    non_functional: list[NonFunctionalReq] = Field(min_length=1, max_length=30)

    personas: list[str] = Field(default_factory=list, max_length=8)
    out_of_scope: list[str] = Field(default_factory=list, max_length=15)

    # Explicit assumptions where the brief was silent. Surfaced to the
    # user in the package so they can correct on re-run.
    assumptions: list[str] = Field(default_factory=list, max_length=15)

    # ≤3 clarify questions. Per product-goals: the runner does not pause
    # for these in MVP; they appear in the package's open-questions
    # section.
    open_questions: list[str] = Field(default_factory=list, max_length=3)
