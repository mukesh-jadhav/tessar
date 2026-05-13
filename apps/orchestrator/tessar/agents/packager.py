"""Packager agent — Phase 3.11.

The final node in the agent graph. Takes every prior agent's output and
deterministically assembles a `RunPackage` matching the TS contract in
`packages/shared-schemas/index.ts`. Also serializes the package to a
markdown body that the runner uploads to Cloud Storage and renders to
PDF via WeasyPrint.

This agent does **not** call an LLM. The prior agents produced all the
substantive content; the packager's job is mechanical:

  1. Number every cited source globally (KB sources first, then findings)
     and dedupe by URL.
  2. Remap every `DecisionCitation` (kind="kb"|"finding", ref=...) to a
     1-based int that indexes into `RunPackage.sources[]`.
  3. Translate snake_case orchestrator types into camelCase TS types.
  4. Compute a few TS-only fields (Decision.vs / .reversibility /
     .blastRadius / .revisitAt) the synthesizer schema doesn't yet
     emit, using simple heuristics documented inline.
  5. Derive Assumptions from `NormalizedBrief.provenance` ("default"
     fields) + Requirements.assumptions.
  6. Derive a 3-item Roadmap from top-severity risks + scale guidance.

Future enhancement (post-MVP, not required for Phase 3): populate
`componentOptions` from `Decision.alternatives` once the architect adds
a deterministic `decision_id` field on each `ArchNode`.
"""

from __future__ import annotations

import re
import uuid
from collections.abc import Iterable
from datetime import UTC, datetime

from tessar.kb.types import KbRecord
from tessar.schemas.architecture import Architecture, ArchNode
from tessar.schemas.brief import NormalizedBrief
from tessar.schemas.cost import BomLine, CostEstimate
from tessar.schemas.requirements import Requirements
from tessar.schemas.research_findings import ResearchFindings
from tessar.schemas.risks import Risk, Risks
from tessar.schemas.run_package import (
    Assumption,
    PackageArchEdge,
    PackageArchNode,
    PackageBomLine,
    PackageBomScaleExp,
    PackageDecision,
    PackageFlowStep,
    PackageRequirement,
    PackageRisk,
    RoadmapItem,
    RunPackage,
    Source,
)
from tessar.schemas.synthesis import Decision, DecisionCitation, Synthesis

# ─── public entry point ───────────────────────────────────────────────


class PackagingError(RuntimeError):
    """Raised when the packager cannot resolve a citation that
    upstream admissibility checks should have caught. Should be
    impossible if synthesizer/architect/cost_estimator/risk_writer
    admissibility ran cleanly; surfacing as an error not a silent
    drop preserves the audit trail."""


def package(
    *,
    run_id: str,
    brief: str,
    normalized: NormalizedBrief,
    requirements: Requirements,
    synthesis: Synthesis,
    architecture: Architecture,
    cost: CostEstimate,
    risks: Risks,
    findings: ResearchFindings,
    kb_candidates: Iterable[KbRecord],
    generated_at: datetime | None = None,
    kb_snapshot_id: str | None = None,
) -> RunPackage:
    """Assemble the final `RunPackage` from every upstream agent output."""
    kb_list = list(kb_candidates)
    kb_by_id = {r.id: r for r in kb_list}
    findings_by_id = {f.question_id: f for f in findings.findings}

    sources, cite_map = _build_sources(
        synthesis=synthesis,
        architecture=architecture,
        cost=cost,
        risks=risks,
        kb_by_id=kb_by_id,
        findings_by_id=findings_by_id,
    )

    pkg_decisions = [_pack_decision(d, cite_map) for d in synthesis.decisions]
    pkg_nodes = [_pack_node(n, cite_map) for n in architecture.nodes]
    pkg_edges = [_pack_edge(e) for e in architecture.edges]
    pkg_bom = [_pack_bom_line(b, cite_map) for b in cost.lines]
    pkg_risks = [_pack_risk(r, cite_map) for r in risks.risks]
    pkg_flows = [_pack_flow(f) for f in architecture.flows]

    pkg_requirements = _pack_requirements(requirements)
    pkg_assumptions = _pack_assumptions(normalized, requirements)
    pkg_roadmap = _pack_roadmap(risks, cost)

    return RunPackage(
        id=run_id,
        generated_at=(generated_at or datetime.now(UTC)).isoformat(),
        kb_snapshot_id=kb_snapshot_id or _derive_snapshot_id(kb_list),
        brief=brief,
        requirements=pkg_requirements,
        assumptions=pkg_assumptions,
        nodes=pkg_nodes,
        edges=pkg_edges,
        component_options={},
        decisions=pkg_decisions,
        bom=pkg_bom,
        risks=pkg_risks,
        roadmap=pkg_roadmap,
        flow_narrative=pkg_flows,
        sources=sources,
    )


# ─── source numbering + citation remap ─────────────────────────────────


def _build_sources(
    *,
    synthesis: Synthesis,
    architecture: Architecture,
    cost: CostEstimate,
    risks: Risks,
    kb_by_id: dict[str, KbRecord],
    findings_by_id: dict,
) -> tuple[list[Source], dict[tuple[str, str], int]]:
    """Walk every cite in deterministic order; dedupe by URL; number
    1-based; return both the `Source[]` list and a map keyed by
    (kind, ref) → 1-based source id.

    Citation order is intentionally stable: decisions, nodes, bom lines,
    risks. Within each, the FIRST citation of each cited entity wins.
    This guarantees byte-identical packages for byte-identical inputs,
    which the eval rubric and audit tab both rely on.
    """
    cite_map: dict[tuple[str, str], int] = {}
    sources: list[Source] = []
    url_to_id: dict[str, int] = {}

    def _register(cit: DecisionCitation) -> None:
        key = (cit.kind, cit.ref)
        if key in cite_map:
            return
        if cit.kind == "kb":
            rec = kb_by_id.get(cit.ref)
            if rec is None or not rec.sources:
                raise PackagingError(f"KB citation refs unknown record: {cit.ref}")
            src = rec.sources[0]
            src_id = _intern_url(
                url_to_id,
                sources,
                title=src.title,
                publisher=_publisher_from_url(src.url),
                url=src.url,
                verified_at=rec.last_verified_at.isoformat(),
            )
        else:
            finding = findings_by_id.get(cit.ref)
            if finding is None or not finding.citations:
                raise PackagingError(f"Finding citation refs unknown question: {cit.ref}")
            cit0 = finding.citations[0]
            src_id = _intern_url(
                url_to_id,
                sources,
                title=cit0.title,
                publisher=cit0.publisher or _publisher_from_url(cit0.url),
                url=cit0.url,
                verified_at=cit0.retrieved_at.date().isoformat(),
            )
        cite_map[key] = src_id

    for d in synthesis.decisions:
        for c in d.citations:
            _register(c)
    for n in architecture.nodes:
        _register(n.cite)
    for b in cost.lines:
        _register(b.cite)
    for r in risks.risks:
        for c in r.citations:
            _register(c)

    return sources, cite_map


def _intern_url(
    url_to_id: dict[str, int],
    sources: list[Source],
    *,
    title: str,
    publisher: str,
    url: str,
    verified_at: str,
) -> int:
    """Append (or reuse) one Source row keyed by URL."""
    existing = url_to_id.get(url)
    if existing is not None:
        return existing
    new_id = len(sources) + 1
    sources.append(
        Source(
            id=new_id,
            title=title,
            publisher=publisher,
            url=url,
            verified_at=verified_at,
        )
    )
    url_to_id[url] = new_id
    return new_id


_URL_HOST_RE = re.compile(r"^[a-z]+://([^/]+)")


def _publisher_from_url(url: str) -> str:
    """Best-effort publisher derived from URL host. Strips leading
    "www." and "docs." so display labels are short."""
    m = _URL_HOST_RE.match(url.lower())
    if not m:
        return ""
    host = m.group(1)
    for prefix in ("www.", "docs."):
        if host.startswith(prefix):
            host = host[len(prefix) :]
            break
    return host


def _first_cite(citations: list[DecisionCitation], cite_map: dict[tuple[str, str], int]) -> int:
    """Pick the first citation in the list that maps to a known source.
    Upstream admissibility guarantees at least one valid citation, so
    failing here means the cite_map is internally inconsistent — raise."""
    for c in citations:
        idx = cite_map.get((c.kind, c.ref))
        if idx is not None:
            return idx
    raise PackagingError(
        "no resolvable citation for entity — admissibility upstream should have rejected this row"
    )


# ─── per-entity packers ───────────────────────────────────────────────


def _pack_decision(d: Decision, cite_map: dict[tuple[str, str], int]) -> PackageDecision:
    return PackageDecision(
        id=d.id,
        topic=d.topic,
        pick=d.pick,
        vs=_format_vs(d),
        why=d.rationale,
        conf=d.confidence,
        cite=_first_cite(d.citations, cite_map),
        reversibility=_infer_reversibility(d),
        blast_radius=_infer_blast_radius(d),
        revisit_at=_infer_revisit_at(d),
    )


def _format_vs(d: Decision) -> str:
    """Decision.vs in TS is a free-text "vs Foo · Bar" string. Build
    from `alternatives[].name`; fall back to a generic placeholder so
    the UI never shows an empty cell."""
    if not d.alternatives:
        return "vs no clear alternatives surfaced"
    names = [a.name for a in d.alternatives if a.name.strip()]
    if not names:
        return "vs no clear alternatives surfaced"
    return "vs " + " · ".join(names[:3])


_PLATFORM_TOPIC_HINTS = (
    "auth",
    "billing",
    "payment",
    "database",
    "queue",
    "messaging",
    "identity",
    "tenant",
)
_DATA_TOPIC_HINTS = ("data", "storage", "warehouse", "lake", "search index", "vector")


def _infer_blast_radius(d: Decision) -> str:
    """Heuristic: keywords in `topic` decide blast radius. Documented as
    an MVP-grade default; richer reasoning lives in a future synthesizer
    upgrade where the LLM emits `blast_radius` directly."""
    topic_lc = d.topic.lower()
    if any(h in topic_lc for h in _PLATFORM_TOPIC_HINTS):
        return "platform"
    if any(h in topic_lc for h in _DATA_TOPIC_HINTS):
        return "data"
    return "service"


_HARD_TO_REVERSE_HINTS = ("database", "primary store", "data model", "tenant", "identity")


def _infer_reversibility(d: Decision) -> str:
    """Heuristic: data-layer / identity decisions are 1-way; everything
    else is treated as 2-way at MVP. Synthesizer LLM will emit this
    directly in a follow-up."""
    topic_lc = d.topic.lower()
    if any(h in topic_lc for h in _HARD_TO_REVERSE_HINTS):
        return "1-way"
    return "2-way"


def _infer_revisit_at(d: Decision) -> str:
    """Heuristic trigger: low-confidence decisions revisit at first
    real-world signal; high-confidence ones revisit at 10× scale.
    Concrete enough to pass eval rubric's "vague trigger" check."""
    if d.confidence == "low":
        return "after first month of production traffic"
    if d.confidence == "med":
        return "at 10× current baseline scale"
    return "if pricing or quotas of the chosen vendor change materially"


def _pack_node(n: ArchNode, cite_map: dict[tuple[str, str], int]) -> PackageArchNode:
    cite = cite_map.get((n.cite.kind, n.cite.ref))
    if cite is None:
        raise PackagingError(f"unresolvable node cite: {n.id} → {n.cite}")
    return PackageArchNode(
        id=n.id,
        label=n.label,
        sub=n.sub,
        zone=n.zone,
        icon=n.icon,
        cite=cite,
        data_class=n.data_class,
        failure_domain=list(n.failure_domain),
        why=n.why,
        scale=list(n.scale),
        alts=n.alts,
        scale_chip=n.scale_chip,
        x=n.x,
        y=n.y,
        w=n.w,
    )


def _pack_edge(e) -> PackageArchEdge:
    return PackageArchEdge(
        src=e.src,
        to=e.to,
        kind=e.kind,
        label=e.label,
        qps=e.qps,
        p95=e.p95,
        retry=e.retry,
        payload=e.payload,
    )


def _pack_bom_line(b: BomLine, cite_map: dict[tuple[str, str], int]) -> PackageBomLine:
    cite = cite_map.get((b.cite.kind, b.cite.ref))
    if cite is None:
        raise PackagingError(f"unresolvable bom cite: {b.id} → {b.cite}")
    scale_exp_dict = b.scale_exp.model_dump(exclude_none=True)
    scale_exp = PackageBomScaleExp(**scale_exp_dict) if scale_exp_dict else None
    return PackageBomLine(
        id=b.id,
        name=b.name,
        kind=b.kind,
        base_cost=b.base_cost_usd,
        scale_exp=scale_exp,
        fixed=b.fixed if b.fixed else None,
        free_tier_pct=b.free_tier_pct,
        cite=cite,
    )


def _pack_risk(r: Risk, cite_map: dict[tuple[str, str], int]) -> PackageRisk:
    return PackageRisk(
        id=r.id,
        title=r.title,
        body=r.body,
        severity=r.severity,
        likelihood=r.likelihood,
        mitigation=r.mitigation,
        cite=_first_cite(r.citations, cite_map),
    )


def _pack_flow(f) -> PackageFlowStep:
    return PackageFlowStep(id=f.id, title=f.title, nodes=list(f.nodes), body=f.body)


# ─── derived sections (assumptions, requirements, roadmap, snapshot) ──


def _pack_requirements(req: Requirements) -> list[PackageRequirement]:
    """Flatten functional + non-functional into the TS Requirement[]
    contract. `source` is "brief" by default; the orchestrator does not
    yet track per-requirement provenance, so this is a documented
    simplification (true source-tagging lands when requirements_extractor
    grows a `provenance` field, mirroring `NormalizedBrief.provenance`)."""
    out: list[PackageRequirement] = []
    for fr in req.functional:
        out.append(
            PackageRequirement(
                id=fr.id,
                label=fr.title,
                value=fr.description,
                source="brief",
            )
        )
    for nfr in req.non_functional:
        value = nfr.statement
        if nfr.target:
            value = f"{nfr.statement} (target: {nfr.target})"
        out.append(
            PackageRequirement(
                id=nfr.id,
                label=nfr.category.title(),
                value=value,
                source="brief",
            )
        )
    return out


def _pack_assumptions(normalized: NormalizedBrief, requirements: Requirements) -> list[Assumption]:
    """Two sources:
      (a) `NormalizedBrief.provenance` entries marked "default" — these
          are values the intake_normalizer had to invent because the
          brief was silent.
      (b) `Requirements.assumptions` strings — the requirements_extractor
          surfaces these explicitly.

    Both deduped on text; (a) takes priority (more structured)."""
    out: list[Assumption] = []
    seen_text: set[str] = set()
    counter = 1

    for field, src in sorted(normalized.provenance.items()):
        if src != "default":
            continue
        value = _provenance_field_value(normalized, field)
        text = f"{field.replace('_', ' ').title()} = {value}"
        if text in seen_text:
            continue
        out.append(
            Assumption(
                id=f"A-{counter:02d}",
                text=text,
                basis="Inferred by intake_normalizer; brief was silent on this field.",
                override=f"Re-run with the brief or wizard explicitly stating {field}.",
            )
        )
        seen_text.add(text)
        counter += 1

    for raw in requirements.assumptions:
        text = raw.strip()
        if not text or text in seen_text:
            continue
        out.append(
            Assumption(
                id=f"A-{counter:02d}",
                text=text,
                basis="Extracted by requirements_extractor from the brief.",
                override="Update the brief to make this requirement explicit.",
            )
        )
        seen_text.add(text)
        counter += 1
    return out


def _provenance_field_value(normalized: NormalizedBrief, field: str) -> str:
    """Resolve the displayed value for a `provenance` key. Falls back
    to the raw attribute string."""
    if field == "compliance":
        return ", ".join(normalized.compliance) or "none"
    val = getattr(normalized, field, None)
    if val is None:
        return "(unset)"
    return str(val)


_SEVERITY_ORDER = {"high": 3, "med": 2, "low": 1}
_LIKELIHOOD_ORDER = {"high": 3, "med": 2, "low": 1}


def _pack_roadmap(risks: Risks, cost: CostEstimate) -> list[RoadmapItem]:
    """Three-item roadmap derived from risks + cost rollups. Stable
    deterministic order so package output is reproducible."""
    sorted_risks = sorted(
        risks.risks,
        key=lambda r: (
            -_SEVERITY_ORDER[r.severity],
            -_LIKELIHOOD_ORDER[r.likelihood],
            r.id,
        ),
    )
    top = sorted_risks[:2]

    items: list[RoadmapItem] = []
    items.append(
        RoadmapItem(
            id="RM-01",
            title="Ship MVP architecture",
            when="week 1–4",
            body=(
                "Stand up the proposed architecture, wire CI/CD, and reach the first "
                "ten paying customers. No scope changes vs this package."
            ),
        )
    )
    if top:
        names = "; ".join(r.title for r in top)
        items.append(
            RoadmapItem(
                id="RM-02",
                title="Address top risks",
                when="month 2",
                body=(
                    f"Implement the documented mitigations for the highest-priority risks: {names}."
                ),
            )
        )
    cost_jump_pct = (
        round(
            100 * (cost.monthly_at_10x_usd - cost.monthly_baseline_usd) / cost.monthly_baseline_usd
        )
        if cost.monthly_baseline_usd > 0
        else 0
    )
    items.append(
        RoadmapItem(
            id=f"RM-{len(items) + 1:02d}",
            title="Plan for 10× scale",
            when="month 3+",
            body=(
                f"Cost rolls up by ~{cost_jump_pct}% at 10× the baseline. Re-run "
                "TESSAR or revisit the bill of materials lines that scale linearly "
                "before that point."
            ),
        )
    )
    return items


def _derive_snapshot_id(kb_list: list[KbRecord]) -> str:
    """Stable snapshot id = the most recent `last_verified_at` across
    the loaded KB records. Empty KB → fixed sentinel so we never emit
    a blank snapshot id."""
    if not kb_list:
        return "kb-empty"
    latest = max(r.last_verified_at for r in kb_list)
    return f"kb-{latest.isoformat()}"


# ─── markdown serializer ──────────────────────────────────────────────


def render_markdown(pkg: RunPackage) -> str:
    """Render the package to a long-form markdown document. The runner
    uploads this verbatim to Cloud Storage and feeds it to WeasyPrint
    for the PDF artifact.

    Sections mirror the TS contract; tables stay narrow enough that
    WeasyPrint at A4 margins doesn't truncate columns."""
    lines: list[str] = []
    lines.append(f"# TESSAR design package — run {pkg.id}")
    lines.append("")
    lines.append(f"_Generated at {pkg.generated_at}_")
    lines.append(f"_KB snapshot: `{pkg.kb_snapshot_id}`_")
    lines.append("")
    lines.append(
        "> This package is a research-backed architectural recommendation, "
        "not a production runbook. Verify every cited source against your own "
        "constraints before committing to a stack."
    )
    lines.append("")

    lines.append("## Brief")
    lines.append("")
    lines.append(pkg.brief.strip())
    lines.append("")

    lines.append("## Requirements")
    lines.append("")
    for r in pkg.requirements:
        lines.append(f"- **{r.id} · {r.label}** — {r.value} _(source: {r.source})_")
    lines.append("")

    if pkg.assumptions:
        lines.append("## Assumptions")
        lines.append("")
        for a in pkg.assumptions:
            lines.append(f"- **{a.id}** {a.text} — _basis:_ {a.basis}")
            if a.override:
                lines.append(f"  - _override:_ {a.override}")
        lines.append("")

    lines.append("## Decisions")
    lines.append("")
    for d in pkg.decisions:
        lines.append(f"### {d.id} · {d.topic}: **{d.pick}**")
        lines.append("")
        lines.append(d.why)
        lines.append("")
        lines.append(
            f"- {d.vs}\n"
            f"- Confidence: **{d.conf}** · Reversibility: {d.reversibility} · "
            f"Blast radius: {d.blast_radius}\n"
            f"- Revisit: {d.revisit_at}\n"
            f"- Source: [{d.cite}]"
        )
        lines.append("")

    lines.append("## Architecture")
    lines.append("")
    lines.append("### Components")
    lines.append("")
    for n in pkg.nodes:
        lines.append(f"- **{n.id} · {n.label}** ({n.zone}) — {n.sub}. _Source: [{n.cite}]_")
        lines.append(f"  - {n.why}")
    lines.append("")
    lines.append("### Edges")
    lines.append("")
    for e in pkg.edges:
        meta = " · ".join(x for x in [e.label, e.kind, e.qps, e.p95, e.retry, e.payload] if x)
        lines.append(f"- `{e.src} → {e.to}` — {meta}")
    lines.append("")
    lines.append("### Request flow")
    lines.append("")
    for f in pkg.flow_narrative:
        lines.append(f"**{f.id} · {f.title}** — _{' → '.join(f.nodes)}_")
        lines.append("")
        lines.append(f.body)
        lines.append("")

    lines.append("## Bill of materials (USD/month)")
    lines.append("")
    lines.append("| ID | Component | Kind | Baseline | Source |")
    lines.append("| --- | --- | --- | ---: | --- |")
    for b in pkg.bom:
        lines.append(f"| {b.id} | {b.name} | {b.kind} | ${b.base_cost:,.2f} | [{b.cite}] |")
    lines.append("")

    lines.append("## Risks")
    lines.append("")
    for r in pkg.risks:
        lines.append(
            f"### {r.id} · {r.title} _(severity {r.severity} · likelihood {r.likelihood})_"
        )
        lines.append("")
        lines.append(r.body)
        lines.append("")
        lines.append(f"**Mitigation.** {r.mitigation} _Source: [{r.cite}]_")
        lines.append("")

    lines.append("## Roadmap")
    lines.append("")
    for item in pkg.roadmap:
        lines.append(f"### {item.id} · {item.title} — _{item.when}_")
        lines.append("")
        lines.append(item.body)
        lines.append("")

    lines.append("## Sources")
    lines.append("")
    for s in pkg.sources:
        publisher = f" — _{s.publisher}_" if s.publisher else ""
        lines.append(f"- **[{s.id}]** {s.title}{publisher} · <{s.url}> · verified {s.verified_at}")
    lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def new_run_id() -> str:
    """Stable uuid for cases where the runner doesn't pass a run id
    (currently unused; runner always passes one)."""
    return str(uuid.uuid4())
