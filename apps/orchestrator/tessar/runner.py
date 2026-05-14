"""Run executor — Phase 2 stub.

Plays a canned timeline (``tessar.canned_timeline``) end-to-end:

    for each event:
        await asyncio.sleep(delta)
        write to Postgres run_events  (durable)
        publish to Redis Stream       (live tail)
    upload package.md to GCS
    record RunArtifact + mark Run succeeded
    publish final ``done`` event

Phase 3 replaces this node-by-node with the real LangGraph agents. The
**event wire format** is the contract the web SSE consumer reads (see
``apps/web/lib/mocks/recorded-run.ts::RecordedEvent``); do not change it
without an ADR.
"""

from __future__ import annotations

import asyncio
import json
import uuid
from datetime import UTC, datetime
from typing import Any

import structlog
from sqlalchemy import make_url
from sqlalchemy.ext.asyncio import AsyncEngine

from tessar.agents.architect import (
    ArchitectureError,
)
from tessar.agents.architect import (
    architect as run_architect,
)
from tessar.agents.cost_estimator import (
    CostEstimationError,
)
from tessar.agents.cost_estimator import (
    estimate as run_cost_estimator,
)
from tessar.agents.intake_normalizer import (
    IntakeNormalizationError,
)
from tessar.agents.intake_normalizer import (
    normalize as intake_normalize,
)
from tessar.agents.packager import (
    PackagingError,
    render_markdown,
)
from tessar.agents.packager import (
    package as run_packager,
)
from tessar.agents.requirements_extractor import (
    RequirementsExtractionError,
)
from tessar.agents.requirements_extractor import (
    extract as extract_requirements,
)
from tessar.agents.research_planner import (
    ResearchPlanningError,
)
from tessar.agents.research_planner import (
    plan as plan_research,
)
from tessar.agents.research_worker import research_all
from tessar.agents.risk_writer import (
    RiskWritingError,
)
from tessar.agents.risk_writer import (
    write_risks as run_risk_writer,
)
from tessar.agents.synthesizer import (
    SynthesisError,
)
from tessar.agents.synthesizer import (
    synthesize as synthesize_decisions,
)
from tessar.canned_timeline import iter_with_delays
from tessar.config import settings
from tessar.db import get_engine, get_sessionmaker
from tessar.db.models import ArtifactKind, Run, RunArtifact, RunEvent, RunStatus
from tessar.llm.factory import build_router
from tessar.redis_bus import publish as redis_publish
from tessar.schemas import BriefGuide, BriefInput
from tessar.search import build_search_client
from tessar.storage import upload_bytes, upload_text

log = structlog.get_logger(__name__)


async def run(run_id: str) -> None:
    """Execute one run end-to-end. Idempotent at the DB layer: if the run
    is already terminal, this is a no-op (Pub/Sub may redeliver)."""
    engine = _engine()
    sessionmaker = get_sessionmaker(engine)

    async with sessionmaker() as session:
        row = await session.get(Run, run_id)
        if row is None:
            log.warning("run.not_found", run_id=run_id)
            return
        if row.status in (RunStatus.succeeded, RunStatus.failed, RunStatus.refunded):
            log.info("run.already_terminal", run_id=run_id, status=row.status)
            return

        row.status = RunStatus.running
        await session.commit()

    log.info("run.started", run_id=run_id)

    # ── Phase 3.3: real intake_normalizer ───────────────────────────
    # Load the brief from the row, run the real Tier-C normalizer, emit
    # phase events with the actual token + USD spend. The remaining 8
    # nodes still play from the canned timeline until 3.4+ replaces them.
    brief_input = await _load_brief(run_id)
    router = build_router()
    try:
        normalized = await asyncio.to_thread(intake_normalize, brief_input, router=router)
    except IntakeNormalizationError as e:
        log.error(
            "intake_normalizer.failed",
            run_id=run_id,
            error=str(e),
            validation_error=getattr(e, "validation_error", None),
            raw_text_preview=(getattr(e, "raw_text", "") or "")[:1500],
        )
        await _mark_failed(run_id)
        await _emit(
            run_id,
            {
                "kind": "phase",
                "t": 200,
                "payload": {
                    "phase": "intake_normalizer",
                    "status": "failed",
                    "note": "normalizer produced invalid JSON twice",
                },
            },
        )
        return

    spend = router.budget.state()
    await _emit(
        run_id,
        {
            "kind": "phase",
            "t": 80,
            "payload": {"phase": "intake_normalizer", "status": "started"},
        },
    )
    await _emit(
        run_id,
        {
            "kind": "metric",
            "t": 120,
            "payload": {
                "tokens": spend.spent_tokens,
                "costUsd": round(spend.spent_usd, 4),
                "sources": 0,
            },
        },
    )
    await _emit(
        run_id,
        {
            "kind": "phase",
            "t": 240,
            "payload": {
                "phase": "intake_normalizer",
                "status": "completed",
                "note": f"Brief normalised \u00b7 domain = {normalized.domain}",
            },
        },
    )
    log.info(
        "intake_normalizer.ok",
        run_id=run_id,
        domain=normalized.domain,
        scale=normalized.scale,
        spent_usd=spend.spent_usd,
    )

    # ── Phase 3.4: real requirements_extractor ──────────────────────
    # Tier-B reasoning over the normalized brief. Up-to-3 clarify
    # questions are surfaced via Requirements.open_questions, NOT a
    # synchronous mid-run pause (see agents/requirements_extractor.py).
    try:
        requirements = await asyncio.to_thread(
            extract_requirements, brief_input, normalized, router=router
        )
    except RequirementsExtractionError as e:
        log.error(
            "requirements_extractor.failed",
            run_id=run_id,
            error=str(e),
            validation_error=getattr(e, "validation_error", None),
            raw_text_preview=(getattr(e, "raw_text", "") or "")[:1500],
        )
        await _mark_failed(run_id)
        await _emit(
            run_id,
            {
                "kind": "phase",
                "t": 1000,
                "payload": {
                    "phase": "requirements_extractor",
                    "status": "failed",
                    "note": "extractor produced invalid JSON twice",
                },
            },
        )
        return

    spend = router.budget.state()
    await _emit(
        run_id,
        {
            "kind": "phase",
            "t": 270,
            "payload": {"phase": "requirements_extractor", "status": "started"},
        },
    )
    await _emit(
        run_id,
        {
            "kind": "metric",
            "t": 480,
            "payload": {
                "tokens": spend.spent_tokens,
                "costUsd": round(spend.spent_usd, 4),
                "sources": 0,
            },
        },
    )
    n_fn = len(requirements.functional)
    n_nfr = len(requirements.non_functional)
    n_open = len(requirements.open_questions)
    note = f"{n_fn} fn reqs \u00b7 {n_nfr} nfrs"
    if n_open:
        note += f" \u00b7 {n_open} open question{'s' if n_open != 1 else ''}"
    await _emit(
        run_id,
        {
            "kind": "phase",
            "t": 1100,
            "payload": {
                "phase": "requirements_extractor",
                "status": "completed",
                "note": note,
            },
        },
    )
    log.info(
        "requirements_extractor.ok",
        run_id=run_id,
        n_functional=n_fn,
        n_non_functional=n_nfr,
        n_open_questions=n_open,
        spent_usd=spend.spent_usd,
    )

    # ── Phase 3.5: real research_planner ────────────────────────
    # Tier-B planning over (NormalizedBrief, Requirements). Emits a
    # bounded list (≤ 8) of prioritized research questions for the
    # parallel research_worker fan-out (Phase 3.6).
    try:
        research_plan = await asyncio.to_thread(
            plan_research, normalized, requirements, router=router
        )
    except ResearchPlanningError as e:
        log.error(
            "research_planner.failed",
            run_id=run_id,
            error=str(e),
            validation_error=getattr(e, "validation_error", None),
            raw_text_preview=(getattr(e, "raw_text", "") or "")[:1500],
        )
        await _mark_failed(run_id)
        await _emit(
            run_id,
            {
                "kind": "phase",
                "t": 1300,
                "payload": {
                    "phase": "research_planner",
                    "status": "failed",
                    "note": "planner produced invalid JSON twice",
                },
            },
        )
        return

    spend = router.budget.state()
    await _emit(
        run_id,
        {
            "kind": "phase",
            "t": 1120,
            "payload": {"phase": "research_planner", "status": "started"},
        },
    )
    await _emit(
        run_id,
        {
            "kind": "metric",
            "t": 1250,
            "payload": {
                "tokens": spend.spent_tokens,
                "costUsd": round(spend.spent_usd, 4),
                "sources": 0,
            },
        },
    )
    n_q = len(research_plan.questions)
    n_high = sum(1 for q in research_plan.questions if q.priority == "high")
    await _emit(
        run_id,
        {
            "kind": "phase",
            "t": 1380,
            "payload": {
                "phase": "research_planner",
                "status": "completed",
                "note": f"{n_q} question{'s' if n_q != 1 else ''} \u00b7 {n_high} high-priority",
            },
        },
    )
    log.info(
        "research_planner.ok",
        run_id=run_id,
        n_questions=n_q,
        n_high_priority=n_high,
        spent_usd=spend.spent_usd,
    )

    # ── Phase 3.6: real research_worker fan-out ──────────────────
    # Tier-B per question, parallelized by `asyncio.Semaphore`. Search
    # is currently a `MockSearchProvider` returning zero hits (every
    # question lands in `errors[]`); the real Tavily/Brave + Trafilatura
    # adapters land in a follow-up ADR-gated slice. Per-question failures
    # do NOT fail the run — only `BudgetExceeded` aborts.
    search_client = build_search_client()
    await _emit(
        run_id,
        {
            "kind": "phase",
            "t": 1400,
            "payload": {
                "phase": "research_workers",
                "status": "started",
                "note": f"{n_q} workers in parallel",
            },
        },
    )
    findings = await research_all(research_plan, router=router, search=search_client, concurrency=4)
    spend = router.budget.state()

    # Stream one `source` event per citation so the UI's source feed
    # behaves like the canned timeline did. Numbering is global across
    # findings (matches the recorded-run shape; per-finding indices live
    # inside the package).
    next_source_id = 1
    for f in findings.findings:
        for citation in f.citations:
            await _emit(
                run_id,
                {
                    "kind": "source",
                    "t": 1400 + next_source_id * 60,
                    "payload": {
                        "id": next_source_id,
                        "title": citation.title,
                        "publisher": citation.publisher or "",
                    },
                },
            )
            next_source_id += 1

    n_sources = next_source_id - 1
    await _emit(
        run_id,
        {
            "kind": "metric",
            "t": 3200,
            "payload": {
                "tokens": spend.spent_tokens,
                "costUsd": round(spend.spent_usd, 4),
                "sources": n_sources,
            },
        },
    )
    n_done = len(findings.findings)
    n_failed = len(findings.errors)
    note = f"{n_done}/{n_q} workers returned"
    if n_failed:
        note += f" \u00b7 {n_failed} unanswered"
    await _emit(
        run_id,
        {
            "kind": "phase",
            "t": 3300,
            "payload": {
                "phase": "research_workers",
                "status": "completed",
                "note": note,
            },
        },
    )
    log.info(
        "research_workers.ok",
        run_id=run_id,
        n_findings=n_done,
        n_errors=n_failed,
        n_sources=n_sources,
        spent_usd=spend.spent_usd,
    )

    # ── Phase 3.7: real synthesizer (first Tier-A node) ──────────
    # Picks components from KB + findings; every pick must cite a KB id
    # or a finding RQ-NN. Ungrounded picks are rejected and re-prompted.
    from tessar.kb import load_kb

    kb_candidates = load_kb()
    await _emit(
        run_id,
        {
            "kind": "phase",
            "t": 3320,
            "payload": {
                "phase": "synthesizer",
                "status": "started",
                "note": f"reasoning over {len(kb_candidates)} KB records · {n_done} findings",
            },
        },
    )
    try:
        synthesis = await asyncio.to_thread(
            synthesize_decisions,
            normalized,
            requirements,
            research_plan,
            findings,
            kb_candidates,
            router=router,
        )
    except SynthesisError as e:
        log.error(
            "synthesizer.failed",
            run_id=run_id,
            error=str(e),
            validation_error=getattr(e, "validation_error", None),
            raw_text_preview=(getattr(e, "raw_text", "") or "")[:1500],
        )
        await _mark_failed(run_id)
        await _emit(
            run_id,
            {
                "kind": "phase",
                "t": 4300,
                "payload": {
                    "phase": "synthesizer",
                    "status": "failed",
                    "note": "synthesizer produced ungrounded or invalid output twice",
                },
            },
        )
        return

    spend = router.budget.state()
    n_decisions = len(synthesis.decisions)
    n_high = sum(1 for d in synthesis.decisions if d.confidence == "high")
    await _emit(
        run_id,
        {
            "kind": "metric",
            "t": 4200,
            "payload": {
                "tokens": spend.spent_tokens,
                "costUsd": round(spend.spent_usd, 4),
            },
        },
    )
    await _emit(
        run_id,
        {
            "kind": "phase",
            "t": 4300,
            "payload": {
                "phase": "synthesizer",
                "status": "completed",
                "note": f"{n_decisions} component(s) picked · {n_high} high-confidence",
            },
        },
    )
    log.info(
        "synthesizer.ok",
        run_id=run_id,
        n_decisions=n_decisions,
        n_high_confidence=n_high,
        spent_usd=spend.spent_usd,
    )

    # ── Phase 3.8: real architect (Tier-A) ──────────────────────
    # Wires synthesizer's component picks into a typed graph of nodes
    # + edges + flows + three Mermaid diagrams. Every node.cite must
    # reference a supplied KB id or a returned RQ-NN finding; every
    # edge from/to and flow node must reference a defined node.id.
    await _emit(
        run_id,
        {
            "kind": "phase",
            "t": 4320,
            "payload": {
                "phase": "architect",
                "status": "started",
                "note": f"wiring {n_decisions} component(s) into a graph",
            },
        },
    )
    try:
        architecture = await asyncio.to_thread(
            run_architect,
            normalized,
            requirements,
            synthesis,
            findings,
            kb_candidates,
            router=router,
        )
    except ArchitectureError as e:
        log.error(
            "architect.failed",
            run_id=run_id,
            error=str(e),
            validation_error=getattr(e, "validation_error", None),
            raw_text_preview=(getattr(e, "raw_text", "") or "")[:1500],
        )
        await _mark_failed(run_id)
        await _emit(
            run_id,
            {
                "kind": "phase",
                "t": 4840,
                "payload": {
                    "phase": "architect",
                    "status": "failed",
                    "note": "architect produced ungrounded or topologically broken output twice",
                },
            },
        )
        return

    spend = router.budget.state()
    n_nodes = len(architecture.nodes)
    n_edges = len(architecture.edges)
    n_flows = len(architecture.flows)
    await _emit(
        run_id,
        {
            "kind": "metric",
            "t": 4700,
            "payload": {
                "tokens": spend.spent_tokens,
                "costUsd": round(spend.spent_usd, 4),
            },
        },
    )
    await _emit(
        run_id,
        {
            "kind": "phase",
            "t": 4840,
            "payload": {
                "phase": "architect",
                "status": "completed",
                "note": f"{n_nodes} nodes \u00b7 {n_edges} edges \u00b7 {n_flows} flow(s)",
            },
        },
    )
    log.info(
        "architect.ok",
        run_id=run_id,
        n_nodes=n_nodes,
        n_edges=n_edges,
        n_flows=n_flows,
        spent_usd=spend.spent_usd,
    )

    # ── Phase 3.9: real cost_estimator (Tier-B) ─────────────────
    # Prices each operational decision against the KB cost map and
    # rolls up monthly totals at 1× / 10× / 100×. Admissibility:
    # KB-cited lines must price within 0.25×–4× of the supplied
    # baseline; rollups must be monotonic.
    await _emit(
        run_id,
        {
            "kind": "phase",
            "t": 4860,
            "payload": {
                "phase": "cost_estimator",
                "status": "started",
                "note": f"pricing {n_decisions} component(s) against KB",
            },
        },
    )
    try:
        cost = await asyncio.to_thread(
            run_cost_estimator,
            normalized,
            synthesis,
            findings,
            kb_candidates,
            router=router,
        )
    except CostEstimationError as e:
        log.error(
            "cost_estimator.failed",
            run_id=run_id,
            error=str(e),
            validation_error=getattr(e, "validation_error", None),
            raw_text_preview=(getattr(e, "raw_text", "") or "")[:1500],
        )
        await _mark_failed(run_id)
        await _emit(
            run_id,
            {
                "kind": "phase",
                "t": 5280,
                "payload": {
                    "phase": "cost_estimator",
                    "status": "failed",
                    "note": "cost_estimator produced ungrounded or inconsistent output twice",
                },
            },
        )
        return

    spend = router.budget.state()
    n_lines = len(cost.lines)
    await _emit(
        run_id,
        {
            "kind": "metric",
            "t": 5100,
            "payload": {
                "tokens": spend.spent_tokens,
                "costUsd": round(spend.spent_usd, 4),
            },
        },
    )
    await _emit(
        run_id,
        {
            "kind": "phase",
            "t": 5280,
            "payload": {
                "phase": "cost_estimator",
                "status": "completed",
                "note": (
                    f"${cost.monthly_baseline_usd:,.0f}/mo baseline \u00b7 "
                    f"${cost.monthly_at_10x_usd:,.0f} at 10\u00d7 \u00b7 "
                    f"{n_lines} line(s)"
                ),
            },
        },
    )
    log.info(
        "cost_estimator.ok",
        run_id=run_id,
        n_lines=n_lines,
        monthly_baseline_usd=cost.monthly_baseline_usd,
        spent_usd=spend.spent_usd,
    )

    # ── Phase 3.10: real risk_writer (Tier-A) ──────────────────
    # Stress-tests the design package and emits typed risks. Every
    # risk.citations entry must be grounded in a supplied KB id or a
    # returned RQ-NN finding; every risk.component_id (when set) must
    # match a synthesis Decision.component_id or an ArchNode.id.
    await _emit(
        run_id,
        {
            "kind": "phase",
            "t": 5300,
            "payload": {
                "phase": "risk_writer",
                "status": "started",
                "note": f"stress-testing {n_nodes} node(s) and {n_lines} cost line(s)",
            },
        },
    )
    try:
        risks = await asyncio.to_thread(
            run_risk_writer,
            normalized,
            requirements,
            synthesis,
            architecture,
            cost,
            findings,
            kb_candidates,
            router=router,
        )
    except RiskWritingError as e:
        log.error(
            "risk_writer.failed",
            run_id=run_id,
            error=str(e),
            validation_error=getattr(e, "validation_error", None),
            raw_text_preview=(getattr(e, "raw_text", "") or "")[:1500],
        )
        await _mark_failed(run_id)
        await _emit(
            run_id,
            {
                "kind": "phase",
                "t": 5800,
                "payload": {
                    "phase": "risk_writer",
                    "status": "failed",
                    "note": "risk_writer produced ungrounded or dangling output twice",
                },
            },
        )
        return

    spend = router.budget.state()
    n_risks = len(risks.risks)
    n_high = sum(1 for r in risks.risks if r.severity == "high")
    await _emit(
        run_id,
        {
            "kind": "metric",
            "t": 5600,
            "payload": {
                "tokens": spend.spent_tokens,
                "costUsd": round(spend.spent_usd, 4),
            },
        },
    )
    await _emit(
        run_id,
        {
            "kind": "phase",
            "t": 5800,
            "payload": {
                "phase": "risk_writer",
                "status": "completed",
                "note": f"{n_risks} risk(s) \u00b7 {n_high} high-severity",
            },
        },
    )
    log.info(
        "risk_writer.ok",
        run_id=run_id,
        n_risks=n_risks,
        n_high_severity=n_high,
        spent_usd=spend.spent_usd,
    )

    # Play the rest of the canned timeline (everything AFTER the real
    # nodes we have already emitted). We filter out:
    #   - any phase event for a node we've replaced;
    #   - canned metric beats whose t falls inside the window we have
    #     already emitted real metrics for;
    #   - canned `source` events attributed to a replaced node (the real
    #     intake_normalizer / requirements_extractor / research_planner
    #     do no web research; the real research_workers emit their own
    #     source events above).
    REPLACED_PHASES = {
        "intake_normalizer",
        "requirements_extractor",
        "research_planner",
        "research_workers",
        "synthesizer",
        "architect",
        "cost_estimator",
        "risk_writer",
        "packager",
    }
    for delay_s, event in iter_with_delays():
        if event["payload"].get("phase") in REPLACED_PHASES:
            continue
        if event["kind"] == "metric" and event["t"] <= 6420:
            continue
        if event["kind"] == "source" and event["t"] <= 6420:
            continue
        if delay_s > 0:
            await asyncio.sleep(delay_s)
        # Cast: _Event is a TypedDict so it's not assignable to dict[str, Any]
        # under strict typing, but at runtime it IS a plain dict.
        await _emit(run_id, dict(event))

    # ── Phase 3.11: real packager (deterministic) ────────────────
    # Assembles every prior agent's output into the locked TS contract
    # `RunPackage`, serializes to markdown, uploads MD + JSON + PDF.
    await _emit(
        run_id,
        {
            "kind": "phase",
            "t": 5820,
            "payload": {
                "phase": "packager",
                "status": "started",
                "note": (
                    f"assembling {n_decisions} decision(s) \u00b7 "
                    f"{n_nodes} node(s) \u00b7 {n_lines} bom line(s) \u00b7 "
                    f"{n_risks} risk(s)"
                ),
            },
        },
    )
    try:
        pkg = await asyncio.to_thread(
            run_packager,
            run_id=run_id,
            brief=brief_input.brief,
            normalized=normalized,
            requirements=requirements,
            synthesis=synthesis,
            architecture=architecture,
            cost=cost,
            risks=risks,
            findings=findings,
            kb_candidates=kb_candidates,
        )
    except PackagingError as e:
        log.error("packager.failed", run_id=run_id, error=str(e))
        await _mark_failed(run_id)
        await _emit(
            run_id,
            {
                "kind": "phase",
                "t": 6420,
                "payload": {
                    "phase": "packager",
                    "status": "failed",
                    "note": "packager could not resolve a citation",
                },
            },
        )
        return

    spend = router.budget.state()
    n_sources_pkg = len(pkg.sources)
    pkg_json_dict = pkg.model_dump(by_alias=True)
    pkg_json_bytes = json.dumps(pkg_json_dict, indent=2, ensure_ascii=False).encode("utf-8")
    md_body = render_markdown(pkg)
    await _emit(
        run_id,
        {
            "kind": "metric",
            "t": 6000,
            "payload": {
                "tokens": spend.spent_tokens,
                "costUsd": round(spend.spent_usd, 4),
                "sources": n_sources_pkg,
            },
        },
    )
    await _emit(
        run_id,
        {
            "kind": "phase",
            "t": 6420,
            "payload": {
                "phase": "packager",
                "status": "completed",
                "note": (f"PDF + Markdown rendered \u00b7 {n_sources_pkg} source(s) numbered"),
            },
        },
    )
    log.info(
        "packager.ok",
        run_id=run_id,
        n_sources=n_sources_pkg,
        n_bytes_md=len(md_body.encode("utf-8")),
        n_bytes_json=len(pkg_json_bytes),
        spent_usd=spend.spent_usd,
    )

    md_uri = upload_text(
        key=f"runs/{run_id}/package.md", body=md_body, content_type="text/markdown"
    )
    json_uri = upload_bytes(
        key=f"runs/{run_id}/package.json",
        body=pkg_json_bytes,
        content_type="application/json",
    )
    pdf_bytes = _render_pdf(md_body)
    pdf_uri: str | None = None
    if pdf_bytes is not None:
        pdf_uri = upload_bytes(
            key=f"runs/{run_id}/package.pdf",
            body=pdf_bytes,
            content_type="application/pdf",
        )

    async with sessionmaker() as session:
        session.add(
            RunArtifact(
                id=str(uuid.uuid4()),
                run_id=run_id,
                kind=ArtifactKind.package_md,
                gcs_uri=md_uri,
                mime="text/markdown",
                bytes=len(md_body.encode("utf-8")),
                sha256=None,
                created_at=datetime.now(UTC),
            )
        )
        session.add(
            RunArtifact(
                id=str(uuid.uuid4()),
                run_id=run_id,
                kind=ArtifactKind.package_json,
                gcs_uri=json_uri,
                mime="application/json",
                bytes=len(pkg_json_bytes),
                sha256=None,
                created_at=datetime.now(UTC),
            )
        )
        if pdf_uri is not None and pdf_bytes is not None:
            session.add(
                RunArtifact(
                    id=str(uuid.uuid4()),
                    run_id=run_id,
                    kind=ArtifactKind.package_pdf,
                    gcs_uri=pdf_uri,
                    mime="application/pdf",
                    bytes=len(pdf_bytes),
                    sha256=None,
                    created_at=datetime.now(UTC),
                )
            )
        row = await session.get(Run, run_id)
        if row is not None:
            row.status = RunStatus.succeeded
            row.completed_at = datetime.now(UTC)
        await session.commit()

    # Final ``done`` event tells the SSE consumer to close + show the CTA.
    await _emit(
        run_id,
        {
            "kind": "done",
            "t": 6500,
            "payload": {"runId": run_id, "artifactUri": md_uri},
        },
    )
    log.info("run.complete", run_id=run_id, md_uri=md_uri, pdf_uri=pdf_uri)


# ─── helpers ─────────────────────────────────────────────────────────────────


def _engine() -> AsyncEngine:
    """Build the engine from settings. Cached inside ``get_engine``."""
    url = make_url(settings.database_url)
    return get_engine(
        host=url.host or "localhost",
        port=url.port or 5432,
        user=url.username or "tessar",
        password=url.password or "",
        database=url.database or "tessar",
    )


async def _load_brief(run_id: str) -> BriefInput:
    """Read the brief JSON off the Run row and parse it through the
    Pydantic mirror. Pydantic enforces the same length bounds the web
    Zod schema uses, so a malformed row is caught here, not deeper in
    the agent code."""
    sessionmaker = get_sessionmaker(_engine())
    async with sessionmaker() as session:
        row = await session.get(Run, run_id)
        if row is None:
            raise RuntimeError(f"run {run_id} disappeared mid-execution")
        raw = row.brief_json or {}
    return BriefInput(
        brief=str(raw.get("brief", "")),
        guide=BriefGuide.model_validate(raw.get("guide") or {}),
    )


async def _mark_failed(run_id: str) -> None:
    """Flip the run to `failed` so the dashboard reflects reality and
    the user is eligible for a refund (Phase 4 wires the refund itself)."""
    sessionmaker = get_sessionmaker(_engine())
    async with sessionmaker() as session:
        row = await session.get(Run, run_id)
        if row is not None:
            row.status = RunStatus.failed
            row.completed_at = datetime.now(UTC)
            await session.commit()


async def _emit(run_id: str, event: dict[str, Any]) -> None:
    """Persist one event to Postgres (durable) and Redis Stream (live).

    Postgres is the authoritative copy that survives Redis trimming. We
    write Postgres first; if Redis is down the run still completes and
    the durable log is intact, the SSE consumer just loses live tail.
    """
    sessionmaker = get_sessionmaker(_engine())
    async with sessionmaker() as session:
        session.add(
            RunEvent(
                run_id=run_id,
                ts=datetime.now(UTC),
                kind=str(event["kind"]),
                # Persist the full wire-format event so a backfill query
                # is just `SELECT payload_json FROM run_events …`.
                payload_json=event,
            )
        )
        await session.commit()
    await redis_publish(run_id, event)


async def _write_canned_package(run_id: str) -> str:
    """Deprecated shim retained for callers; prefer ``_canned_package_body``
    + explicit upload so we can render a PDF from the same source."""
    body = _canned_package_body(run_id)
    return upload_text(key=f"runs/{run_id}/package.md", body=body, content_type="text/markdown")


def _canned_package_body(run_id: str) -> str:
    """Single source of truth for the stub package contents — Phase 3
    replaces this with the real packager output (RunPackage JSON →
    markdown → PDF)."""
    return f"""# TESSAR run {run_id}

_This is a stub package emitted by the Phase-2 plumbing. Phase 3 replaces
this with the real packager output (RunPackage JSON → markdown → PDF)._

Generated at: {datetime.now(UTC).isoformat()}
"""


def _render_pdf(md_body: str) -> bytes | None:
    """Render markdown to PDF via WeasyPrint. Returns ``None`` if WeasyPrint
    cannot be imported (Windows dev boxes without GTK/Pango/Cairo). The
    md artifact is still produced and the run still succeeds; cloud
    deploy targets Linux where WeasyPrint always works.
    """
    try:
        import markdown as md_lib  # type: ignore[import-untyped,import-not-found]
        from weasyprint import HTML  # type: ignore[import-untyped,import-not-found]
    except (ImportError, OSError) as exc:  # pragma: no cover - env-dependent
        # OSError covers Windows dev boxes where WeasyPrint imports but its
        # native GTK/Pango/Cairo dlopen fails. Cloud Run image has them.
        log.warning("pdf.skip_import", error=str(exc))
        return None

    html_body = md_lib.markdown(md_body, extensions=["fenced_code", "tables"])
    html_doc = f"""<!doctype html>
<html><head><meta charset="utf-8"><title>TESSAR package</title>
<style>
  @page {{ size: A4; margin: 22mm 18mm; }}
  body {{ font-family: "Inter", "Segoe UI", sans-serif; color: #111;
         font-size: 10.5pt; line-height: 1.55; }}
  h1 {{ font-size: 22pt; margin: 0 0 12pt; }}
  h2 {{ font-size: 14pt; margin: 18pt 0 6pt; }}
  code, pre {{ font-family: "Cascadia Code", "Consolas", monospace;
               background: #f4f4f6; border-radius: 4px; }}
  pre {{ padding: 10pt; overflow-wrap: anywhere; }}
  code {{ padding: 1pt 4pt; }}
  blockquote {{ border-left: 3px solid #d4d4d8; margin: 0; padding: 2pt 12pt;
                color: #555; font-style: italic; }}
</style></head><body>{html_body}</body></html>"""
    try:
        return HTML(string=html_doc).write_pdf()
    except Exception as exc:  # pragma: no cover - env-dependent
        log.warning("pdf.render_failed", error=str(exc))
        return None
