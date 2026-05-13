"""Tier policy: which agent gets which LLM tier.

Locked by `architecture.instructions.md` ("LLM tier policy"). Changing this
table requires an ADR (it directly affects per-run cost and quality).
"""

from __future__ import annotations

from .types import Tier

# Agent name -> tier. Agent names match the graph in MVP.md §3.4.
TIER_FOR_AGENT: dict[str, Tier] = {
    # Tier-C — cheap classification / normalization
    "intake_normalizer": Tier.C,
    "source_dedup": Tier.C,
    "classifier": Tier.C,
    # Tier-B — research + extraction
    "requirements_extractor": Tier.B,
    "research_planner": Tier.B,
    "research_worker": Tier.B,
    "cost_estimator": Tier.B,
    "packager": Tier.B,
    # Tier-A — frontier reasoning
    "synthesizer": Tier.A,
    "architect": Tier.A,
    # Canonical name from MVP.md §3.4 plus the short alias used by the
    # canned timeline + the agent module file (`tessar/agents/risk_writer.py`).
    "risk_and_tradeoff_writer": Tier.A,
    "risk_writer": Tier.A,
}


def tier_for(agent_name: str) -> Tier:
    """Look up an agent's tier. Unknown agents default to Tier-B (mid).

    Defaulting to B (not A) keeps cost-floor predictable when a new agent
    is wired in before the tier table is updated. The CI eval suite will
    catch quality regressions if the default is wrong.
    """
    return TIER_FOR_AGENT.get(agent_name, Tier.B)
