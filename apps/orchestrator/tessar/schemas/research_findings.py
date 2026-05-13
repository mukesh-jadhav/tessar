"""ResearchFindings schema — output of the parallel `research_worker`
fan-out.

One `ResearchFinding` per answered `ResearchQuestion`. Questions that
could not be answered (provider error, zero hits, two validation
failures) land in `errors[]` so the run can continue without losing
the audit trail.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Confidence = Literal["low", "med", "high"]


class Citation(BaseModel):
    """One source row backing a finding. Mirrors the trust requirement
    in `product-goals.instructions.md`: every recommendation cites a KB
    record or a web source — citations live here on findings, get
    threaded through to decisions in the synthesizer."""

    model_config = ConfigDict(extra="forbid")

    url: str = Field(min_length=4, max_length=2048)
    title: str = Field(min_length=1, max_length=300)
    snippet: str = Field(default="", max_length=500)
    publisher: str | None = Field(default=None, max_length=200)
    retrieved_at: datetime
    published_at: datetime | None = None


class KeyPoint(BaseModel):
    """One factual point extracted from the citations.

    `cites[]` is a list of 1-based indices into the parent finding's
    `citations[]` list — every point must be backed by at least one
    citation. The synthesizer uses these to wire decisions back to URLs.
    """

    model_config = ConfigDict(extra="forbid")

    statement: str = Field(min_length=10, max_length=400)
    cites: list[int] = Field(min_length=1, max_length=6)


class ResearchFinding(BaseModel):
    """A single answered research question."""

    model_config = ConfigDict(extra="forbid")

    question_id: str = Field(min_length=1, max_length=8, pattern=r"^RQ-\d{1,3}$")
    summary: str = Field(min_length=20, max_length=1200)
    key_points: list[KeyPoint] = Field(min_length=1, max_length=8)
    citations: list[Citation] = Field(min_length=1, max_length=8)
    confidence: Confidence
    open_questions: list[str] = Field(default_factory=list, max_length=3)


class ResearchError(BaseModel):
    """A question the worker swarm could not answer.

    Keeping these structured (instead of just dropping them) means the
    synthesizer can mark related decisions as low-confidence and the
    audit tab can show *why* a question went unanswered.
    """

    model_config = ConfigDict(extra="forbid")

    question_id: str = Field(min_length=1, max_length=8, pattern=r"^RQ-\d{1,3}$")
    reason: str = Field(min_length=3, max_length=500)


class ResearchFindings(BaseModel):
    """Aggregated output of the worker fan-out.

    Invariant enforced upstream (in `research_worker.research_all`):
    every question in the input `ResearchPlan` appears exactly once,
    either in `findings[]` or in `errors[]`.
    """

    model_config = ConfigDict(extra="forbid")

    findings: list[ResearchFinding] = Field(default_factory=list, max_length=8)
    errors: list[ResearchError] = Field(default_factory=list, max_length=8)
