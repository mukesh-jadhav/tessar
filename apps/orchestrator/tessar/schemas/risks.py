"""Risk writer output schema.

Each `Risk` is one operational, security, cost, or compliance hazard
that the architect's design exposes the user to. Every risk MUST cite
at least one source — either a KB record id (`kind="kb"`,
`ref="<KbRecord.id>"`) or a research finding (`kind="finding"`,
`ref="<RQ-NN>"`). Ungrounded risks violate the trust requirement and
the agent's retry/error path enforces this.

Severity = impact if it happens. Likelihood = probability under the
brief's assumptions. Mitigation = ≤3 sentence concrete action the
operator can take BEFORE the risk materialises.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from .synthesis import DecisionCitation

Severity = Literal["low", "med", "high"]
RiskCategory = Literal[
    "security",
    "reliability",
    "cost",
    "compliance",
    "operability",
    "vendor",
    "performance",
    "data",
]


class Risk(BaseModel):
    """One operational, security, cost, or compliance hazard."""

    model_config = ConfigDict(extra="forbid")

    id: str = Field(pattern=r"^R-\d{1,3}$", min_length=3, max_length=8)
    title: str = Field(min_length=3, max_length=120)
    body: str = Field(min_length=40, max_length=1200)
    category: RiskCategory
    severity: Severity
    likelihood: Severity
    mitigation: str = Field(min_length=20, max_length=600)
    component_id: str | None = Field(default=None, max_length=80)
    """Optional cross-link to a synthesis Decision.component_id or
    architecture ArchNode.id this risk attaches to."""
    citations: list[DecisionCitation] = Field(min_length=1, max_length=8)


class Risks(BaseModel):
    """Full set of risks for one run."""

    model_config = ConfigDict(extra="forbid")

    risks: list[Risk] = Field(min_length=1, max_length=20)
    notes: str | None = Field(default=None, max_length=1500)
