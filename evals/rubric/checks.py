"""
Auto-checkable axes for the TESSAR eval rubric (ADR-0008).

Each axis returns an `AxisScore` with score ∈ [0, 10] and a list of
human-readable findings explaining the score. These checks are pure
functions of the persisted `RunPackage` artifact and an optional
KB snapshot — no LLM calls, fully deterministic.

Axes implemented here:
- groundedness  (weight 25%)
- schema_validity (weight 15%)
- cost_realism (weight 10%)

Judged axes (coherence, tradeoff_quality, brief_fidelity) live in
`evals/rubric/judge_prompts/` and are invoked from Phase 3.2+ once the
LLM router exists.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from pydantic import ValidationError

from .schema import RunPackage

# ─── Result types ────────────────────────────────────────────────


@dataclass
class AxisScore:
    """One rubric axis applied to one run."""

    axis: str  # canonical axis name (e.g. "groundedness")
    score: float  # 0.0 – 10.0
    findings: list[str] = field(default_factory=list)
    """Plain-English bullets explaining the score. Always ≥1 entry."""

    def __post_init__(self) -> None:
        if not 0.0 <= self.score <= 10.0:
            raise ValueError(f"score {self.score} out of [0,10] for axis {self.axis}")
        if not self.findings:
            self.findings.append("(no findings — this should not happen)")


# ─── Axis 1: Groundedness ────────────────────────────────────────


_CITED_FIELDS_SCHEMA: dict[str, str] = {
    # path-into-RunPackage → human label for findings
    "nodes": "architecture node",
    "decisions": "decision",
    "bom": "BOM line",
    "risks": "risk",
    # ADR-0006 narrative fields that carry a `cite`
    "integrationContracts": "integration contract",
    "componentRationales": "component rationale",
    "failureModes": "failure mode",
}


def groundedness(pkg_dict: dict[str, Any]) -> AxisScore:
    """Every recommendation must cite a real `Source` in `sources[]`.

    Score = 10 × (cited_picks / total_picks). A `cite` of 0 (the schema
    sentinel "uncited") OR a `cite` pointing to a non-existent source
    counts as ungrounded.
    """
    sources_by_id: dict[int, Any] = {
        s["id"]: s
        for s in pkg_dict.get("sources", [])
        if isinstance(s, dict) and "id" in s
    }

    total = 0
    cited = 0
    findings: list[str] = []

    for field_name, label in _CITED_FIELDS_SCHEMA.items():
        items = pkg_dict.get(field_name, []) or []
        for item in items:
            if not isinstance(item, dict):
                continue
            total += 1
            cite = item.get("cite")
            item_id = item.get("id", "<unknown>")
            if not isinstance(cite, int) or cite <= 0:
                findings.append(f"ungrounded: {label} `{item_id}` has no `cite`.")
            elif cite not in sources_by_id:
                findings.append(
                    f"dangling cite: {label} `{item_id}` cites source #{cite} which is not in sources[]."
                )
            else:
                cited += 1

    if total == 0:
        return AxisScore(
            axis="groundedness",
            score=0.0,
            findings=[
                "no nodes/decisions/bom/risks emitted at all — nothing to ground."
            ],
        )

    score = 10.0 * cited / total
    if not findings:
        findings.append(f"all {total} picks cited a real source.")
    else:
        findings.insert(0, f"{cited}/{total} picks grounded ({score:.1f}/10).")
    return AxisScore(axis="groundedness", score=score, findings=findings)


# ─── Axis 2: Schema validity ─────────────────────────────────────


def schema_validity(pkg_dict: dict[str, Any]) -> AxisScore:
    """The package must parse against the Pydantic mirror of `RunPackage`.

    Binary at the package level: 10 if it parses, otherwise 0. Findings
    enumerate the validation errors so the orchestrator owner can fix the
    emitting agent.

    NOTE: the mirror is intentionally a SUBSET of the full TS contract —
    this catches breakage in the load-bearing fields (id, sources, picks)
    but not every cosmetic field. Full mirror lands with the real packager.
    """
    try:
        RunPackage.model_validate(pkg_dict)
    except ValidationError as exc:
        errors = exc.errors()
        findings = [f"schema validation failed with {len(errors)} error(s):"]
        for e in errors[:10]:  # cap so reports stay readable
            loc = ".".join(str(p) for p in e.get("loc", ()))
            findings.append(f"  - {loc}: {e.get('msg', '')}")
        if len(errors) > 10:
            findings.append(f"  - … {len(errors) - 10} more.")
        return AxisScore(axis="schema_validity", score=0.0, findings=findings)
    return AxisScore(
        axis="schema_validity",
        score=10.0,
        findings=["package parses against the locked subset of `RunPackage`."],
    )


# ─── Axis 5: Cost realism ────────────────────────────────────────


def cost_realism(
    pkg_dict: dict[str, Any],
    kb_costs: dict[str, float] | None = None,
    tolerance: float = 0.5,
) -> AxisScore:
    """Each `BomLine.baseCost` must fall within ±`tolerance` (default 50%)
    of the KB's published unit cost for that component.

    Score = 10 × (within_tolerance / total_with_kb_match).
    Lines whose `name` doesn't match a KB record are ignored (counted
    in findings as 'unmapped' but neither penalised nor rewarded — the KB
    is the source of truth for cost; if it's missing a record, that's a
    KB gap, not a run failure).

    `kb_costs` maps a component name (case-insensitive, normalised) to
    its baseline USD/month. Until KB seed lands (Phase 3.1), pass an empty
    dict and this axis returns score=10 with a "no KB available" finding,
    so it doesn't drag the aggregate down on day 1.
    """
    bom = pkg_dict.get("bom", []) or []
    if not isinstance(bom, list) or not bom:
        return AxisScore(
            axis="cost_realism",
            score=0.0,
            findings=["package has no BOM lines — cannot evaluate cost realism."],
        )

    if not kb_costs:
        return AxisScore(
            axis="cost_realism",
            score=10.0,
            findings=[
                "no KB cost map provided — skipping check (returning 10/10).",
                "this axis becomes load-bearing once Phase 3.1 KB seed lands.",
            ],
        )

    kb_norm = {_norm(name): cost for name, cost in kb_costs.items()}
    findings: list[str] = []
    matched = 0
    within = 0
    unmapped = 0

    for line in bom:
        if not isinstance(line, dict):
            continue
        name = line.get("name", "")
        cost = line.get("baseCost")
        if not isinstance(cost, (int, float)) or cost < 0:
            findings.append(
                f"BOM line `{line.get('id', name)}` has invalid baseCost={cost!r}."
            )
            matched += 1
            continue
        kb_cost = kb_norm.get(_norm(name))
        if kb_cost is None:
            unmapped += 1
            continue
        matched += 1
        lo = kb_cost * (1 - tolerance)
        hi = kb_cost * (1 + tolerance)
        if lo <= cost <= hi:
            within += 1
        else:
            findings.append(
                f"BOM line `{name}`: ${cost:.2f}/mo is outside ±{int(tolerance * 100)}% "
                f"of KB price ${kb_cost:.2f}/mo (range ${lo:.2f}–${hi:.2f})."
            )

    if matched == 0:
        return AxisScore(
            axis="cost_realism",
            score=10.0,
            findings=[
                f"no BOM line matched a KB record ({unmapped} unmapped) — nothing to score."
            ],
        )

    score = 10.0 * within / matched
    findings.insert(
        0,
        f"{within}/{matched} BOM lines within ±{int(tolerance * 100)}% of KB ({unmapped} unmapped, ignored).",
    )
    return AxisScore(axis="cost_realism", score=score, findings=findings)


def _norm(s: str) -> str:
    return "".join(c.lower() for c in s if c.isalnum())


# ─── Auto-axis: ADR-0006 narrative completeness ─────────────────


def adr0006_completeness(pkg_dict: dict[str, Any]) -> AxisScore:
    """Structural coverage of the 5 ADR-0006 narrative artifacts.

    Score = 10 × (passed_checks / total_checks) over these checks:
      1. `sequenceDiagrams` covers exactly {write, read, async}.
      2. `integrationContracts` non-empty AND every contract's
         `(from, to)` matches a real edge.
      3. `componentRationales` non-empty AND each `requirementId`
         resolves to a real `requirements[].id`.
      4. `failureModes` covers every node whose `failureDomain` is
         non-empty (architect must fail-mode every fragile node).
      5. `buildSequence` has between 3 and 6 phases AND every node
         referenced in `phase.nodes` exists in `nodes[]`.

    This is structural only — judge prompts in
    `evals/rubric/judge_prompts/{sequence_diagrams,integration_contracts,
    component_rationales,failure_modes,build_sequence}.md` cover quality.
    """
    findings: list[str] = []
    passed = 0
    total = 5

    # 1. sequence diagram kinds
    seqs = pkg_dict.get("sequenceDiagrams") or []
    seq_kinds = {s.get("kind") for s in seqs if isinstance(s, dict)}
    if seq_kinds == {"write", "read", "async"}:
        passed += 1
    else:
        findings.append(
            f"sequenceDiagrams cover {sorted(k for k in seq_kinds if k)} — "
            "expected {'write', 'read', 'async'}."
        )

    # 2. integration contracts grounded in edges
    contracts = pkg_dict.get("integrationContracts") or []
    edges = pkg_dict.get("edges") or []
    edge_pairs = {(e.get("from"), e.get("to")) for e in edges if isinstance(e, dict)}
    if contracts and all(
        isinstance(c, dict) and (c.get("from"), c.get("to")) in edge_pairs
        for c in contracts
    ):
        passed += 1
    elif not contracts:
        findings.append("integrationContracts is empty.")
    else:
        bad = [
            (c.get("from"), c.get("to"))
            for c in contracts
            if isinstance(c, dict) and (c.get("from"), c.get("to")) not in edge_pairs
        ]
        findings.append(f"integrationContracts reference unknown edges: {bad}.")

    # 3. component rationales link to real requirements
    rationales = pkg_dict.get("componentRationales") or []
    req_ids = {
        r.get("id") for r in pkg_dict.get("requirements", []) if isinstance(r, dict)
    }
    if rationales and all(
        isinstance(r, dict) and r.get("requirementId") in req_ids for r in rationales
    ):
        passed += 1
    elif not rationales:
        findings.append("componentRationales is empty.")
    else:
        bad = [
            r.get("requirementId")
            for r in rationales
            if isinstance(r, dict) and r.get("requirementId") not in req_ids
        ]
        findings.append(f"componentRationales reference unknown requirements: {bad}.")

    # 4. failure modes cover every fragile node
    fragile_nodes = {
        n.get("id")
        for n in pkg_dict.get("nodes", [])
        if isinstance(n, dict) and n.get("failureDomain")
    }
    fm_nodes = {
        f.get("nodeId") for f in pkg_dict.get("failureModes", []) if isinstance(f, dict)
    }
    missing = fragile_nodes - fm_nodes
    if not missing:
        passed += 1
    else:
        findings.append(
            f"failureModes missing entries for fragile nodes: {sorted(missing)}."
        )

    # 5. build sequence size + node refs
    phases = pkg_dict.get("buildSequence") or []
    node_ids = {n.get("id") for n in pkg_dict.get("nodes", []) if isinstance(n, dict)}
    bp_refs = {
        ref for p in phases if isinstance(p, dict) for ref in (p.get("nodes") or [])
    }
    if 3 <= len(phases) <= 6 and bp_refs.issubset(node_ids):
        passed += 1
    elif not (3 <= len(phases) <= 6):
        findings.append(
            f"buildSequence has {len(phases)} phases — ADR-0006 requires 3–6."
        )
    else:
        findings.append(
            f"buildSequence references unknown nodes: {sorted(bp_refs - node_ids)}."
        )

    score = 10.0 * passed / total
    findings.insert(
        0, f"{passed}/{total} ADR-0006 structural checks passed ({score:.1f}/10)."
    )
    return AxisScore(axis="adr0006_completeness", score=score, findings=findings)


# ─── Convenience: load a package JSON file ───────────────────────


def load_package(path: str | Path) -> dict[str, Any]:
    """Load a `RunPackage` JSON file as a dict (no validation here —
    `schema_validity` does that)."""
    return json.loads(Path(path).read_text(encoding="utf-8"))
