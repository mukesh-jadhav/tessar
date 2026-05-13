"""Tests for the `packager` agent (Phase 3.11).

Deterministic — no LLM calls. Builds upstream agent outputs by hand,
calls `package(...)`, asserts the assembled `RunPackage` matches the
TS contract and that citation indices resolve correctly.
"""

from __future__ import annotations

import json
from datetime import UTC, date, datetime

import pytest

from tessar.agents.packager import (
    PackagingError,
    _derive_snapshot_id,
    _format_vs,
    _infer_blast_radius,
    _infer_reversibility,
    _infer_revisit_at,
    _publisher_from_url,
    package,
    render_markdown,
)
from tessar.kb import KbRecord
from tessar.schemas import (
    Architecture,
    CostEstimate,
    NormalizedBrief,
    Requirements,
    ResearchFindings,
    Risks,
    RunPackage,
    Synthesis,
)
from tessar.schemas.synthesis import Decision, DecisionCitation

# ─── helpers (mirror the upstream agents' outputs) ───────────────────


def _normalized() -> NormalizedBrief:
    return NormalizedBrief.model_validate(
        {
            "summary": "B2B CRM aimed at small sales teams.",
            "domain": "b2b",
            "scale": "growing",
            "region": "eu",
            "cloud": "gcp",
            "compliance": ["soc2"],
            "latency": "standard",
            "budget": "standard",
            "key_constraints": ["EU data residency"],
            "provenance": {
                "domain": "brief",
                "scale": "default",
                "region": "brief",
                "cloud": "brief",
                "compliance": "brief",
                "latency": "default",
                "budget": "default",
            },
        }
    )


def _requirements() -> Requirements:
    return Requirements.model_validate(
        {
            "functional": [
                {
                    "id": "FR-01",
                    "title": "Capture leads",
                    "description": "Sales reps capture form submissions.",
                    "priority": "must",
                }
            ],
            "non_functional": [
                {
                    "id": "NFR-01",
                    "category": "security",
                    "statement": "PII is encrypted at rest.",
                    "target": "AES-256",
                }
            ],
            "personas": ["Sales rep"],
            "out_of_scope": [],
            "assumptions": ["Single-region launch is acceptable"],
            "open_questions": [],
        }
    )


def _synthesis() -> Synthesis:
    return Synthesis.model_validate(
        {
            "decisions": [
                {
                    "id": "D-01",
                    "topic": "Compute runtime",
                    "pick": "Cloud Run",
                    "component_id": "gcp.cloud-run",
                    "rationale": "GCP brief; scales to zero; SOC-2 eligible.",
                    "alternatives": [
                        {
                            "name": "GKE Autopilot",
                            "why_not": "More ops surface than needed at MVP.",
                        },
                        {"name": "Cloud Functions", "why_not": "Tighter limits on concurrency."},
                    ],
                    "confidence": "high",
                    "citations": [{"kind": "kb", "ref": "gcp.cloud-run"}],
                },
                {
                    "id": "D-02",
                    "topic": "Primary database",
                    "pick": "Cloud SQL Postgres + pgvector",
                    "component_id": "gcp.cloud-sql-postgres",
                    "rationale": "Relational + vector at MVP scale.",
                    "alternatives": [],
                    "confidence": "med",
                    "citations": [
                        {"kind": "kb", "ref": "gcp.cloud-sql-postgres"},
                        {"kind": "finding", "ref": "RQ-01"},
                    ],
                },
                {
                    "id": "D-03",
                    "topic": "Auth provider",
                    "pick": "Auth.js + Resend magic links",
                    "component_id": None,
                    "rationale": "Low-friction sign-in for B2B trials.",
                    "alternatives": [],
                    "confidence": "low",
                    "citations": [{"kind": "finding", "ref": "RQ-01"}],
                },
            ],
            "notes": None,
        }
    )


def _findings() -> ResearchFindings:
    return ResearchFindings.model_validate(
        {
            "findings": [
                {
                    "question_id": "RQ-01",
                    "summary": "pgvector on Cloud SQL handles 50k embeddings with HNSW.",
                    "key_points": [{"statement": "HNSW p95 < 100ms.", "cites": [1]}],
                    "citations": [
                        {
                            "url": "https://example.com/pgvector",
                            "title": "pgvector benchmarks",
                            "snippet": "HNSW p95 < 100ms.",
                            "publisher": "example.com",
                            "retrieved_at": datetime(2026, 5, 13, tzinfo=UTC),
                            "published_at": None,
                        }
                    ],
                    "confidence": "high",
                    "open_questions": [],
                }
            ],
            "errors": [],
        }
    )


def _kb() -> list[KbRecord]:
    return [
        KbRecord.model_validate(
            {
                "id": "gcp.cloud-run",
                "name": "Cloud Run",
                "category": "compute.serverless-containers",
                "vendor": "google",
                "cloud": "gcp",
                "pricing_model": "per-request",
                "baseline_cost_usd_per_month": 60.0,
                "baseline_cost_assumptions": "1 vCPU, 512MiB.",
                "regions": ["europe-west1"],
                "compliance": ["SOC2"],
                "capabilities": ["http-server"],
                "alternatives": [],
                "sources": [
                    {
                        "url": "https://cloud.google.com/run",
                        "title": "Cloud Run product page",
                        "snapshot_date": date(2026, 5, 11),
                    }
                ],
                "last_verified_at": date(2026, 5, 11),
            }
        ),
        KbRecord.model_validate(
            {
                "id": "gcp.cloud-sql-postgres",
                "name": "Cloud SQL for Postgres",
                "category": "data.relational",
                "vendor": "google",
                "cloud": "gcp",
                "pricing_model": "per-vCPU-hour",
                "baseline_cost_usd_per_month": 120.0,
                "baseline_cost_assumptions": "db-custom-1-4096, 100GB SSD.",
                "regions": ["europe-west1"],
                "compliance": ["SOC2"],
                "capabilities": ["postgres-16", "pgvector"],
                "alternatives": [],
                "sources": [
                    {
                        "url": "https://cloud.google.com/sql",
                        "title": "Cloud SQL product page",
                        "snapshot_date": date(2026, 5, 12),
                    }
                ],
                "last_verified_at": date(2026, 5, 12),
            }
        ),
    ]


def _scale_triplet(suffix: str = "node") -> list[dict]:
    return [
        {"tier": "1×", "note": f"single instance · {suffix}"},
        {"tier": "10×", "note": f"horizontally scaled · {suffix}"},
        {"tier": "100×", "note": f"shard / move to managed alternative · {suffix}"},
    ]


def _architecture() -> Architecture:
    return Architecture.model_validate(
        {
            "nodes": [
                {
                    "id": "N-01",
                    "label": "Browser",
                    "sub": "Next.js client",
                    "zone": "client",
                    "icon": "browser",
                    "cite": {"kind": "kb", "ref": "gcp.cloud-run"},
                    "data_class": "internal",
                    "failure_domain": [],
                    "why": "End-user entry point; renders the React UI.",
                    "scale": _scale_triplet("browser"),
                    "alts": "",
                    "scale_chip": None,
                    "x": 10.0,
                    "y": 50.0,
                    "w": 18.0,
                },
                {
                    "id": "N-02",
                    "label": "Cloud Run (web)",
                    "sub": "Next.js 15 · API + UI",
                    "zone": "app",
                    "icon": "container",
                    "cite": {"kind": "kb", "ref": "gcp.cloud-run"},
                    "data_class": "confidential",
                    "failure_domain": ["N-01"],
                    "why": "Hosts the Next.js app; scales to zero.",
                    "scale": _scale_triplet("web"),
                    "alts": "GKE Autopilot",
                    "scale_chip": "min=1",
                    "x": 50.0,
                    "y": 30.0,
                    "w": 18.0,
                },
                {
                    "id": "N-03",
                    "label": "Cloud SQL Postgres",
                    "sub": "Postgres 16 + pgvector",
                    "zone": "data",
                    "icon": "database",
                    "cite": {"kind": "finding", "ref": "RQ-01"},
                    "data_class": "regulated",
                    "failure_domain": ["N-02"],
                    "why": "Single store for relational + vector data.",
                    "scale": _scale_triplet("db"),
                    "alts": "Spanner",
                    "scale_chip": "50k rows",
                    "x": 75.0,
                    "y": 30.0,
                    "w": 18.0,
                },
                {
                    "id": "N-04",
                    "label": "Stripe",
                    "sub": "Checkout + webhooks",
                    "zone": "external",
                    "icon": "card",
                    "cite": {"kind": "kb", "ref": "gcp.cloud-run"},
                    "data_class": "regulated",
                    "failure_domain": [],
                    "why": "External payment processor.",
                    "scale": _scale_triplet("stripe"),
                    "alts": "",
                    "scale_chip": None,
                    "x": 92.0,
                    "y": 70.0,
                    "w": 16.0,
                },
            ],
            "edges": [
                {
                    "from": "N-01",
                    "to": "N-02",
                    "kind": "sync",
                    "label": "POST /runs",
                    "qps": "5",
                    "p95": "120ms",
                    "retry": None,
                    "payload": "BriefInput",
                },
                {
                    "from": "N-02",
                    "to": "N-03",
                    "kind": "data",
                    "label": "read/write",
                    "qps": None,
                    "p95": "20ms",
                    "retry": None,
                    "payload": None,
                },
                {
                    "from": "N-04",
                    "to": "N-02",
                    "kind": "external",
                    "label": "stripe.session.completed",
                    "qps": None,
                    "p95": None,
                    "retry": "with-backoff",
                    "payload": "Webhook",
                },
            ],
            "flows": [
                {
                    "id": "F-01",
                    "title": "Submit a brief",
                    "nodes": ["N-01", "N-02", "N-03"],
                    "body": "User submits the brief; web writes Run row and opens SSE; orchestrator drives agent graph.",
                }
            ],
            "diagrams": {
                "c4": "flowchart TD\n  N1[Browser] --> N2[Cloud Run] --> N3[(DB)]",
                "data_flow": "flowchart LR\n  N1 --> N2 --> N3",
                "sequence": "sequenceDiagram\n  actor U\n  participant W\n  U->>W: POST /runs",
            },
            "notes": None,
        }
    )


def _cost() -> CostEstimate:
    return CostEstimate.model_validate(
        {
            "currency": "USD",
            "lines": [
                {
                    "id": "B-01",
                    "name": "Cloud Run (web)",
                    "kind": "compute",
                    "base_cost_usd": 60.0,
                    "scale_exp": {"users": 1.0, "rps": 1.0},
                    "fixed": False,
                    "free_tier_pct": 10.0,
                    "cite": {"kind": "kb", "ref": "gcp.cloud-run"},
                    "component_id": "gcp.cloud-run",
                    "assumptions": "1 vCPU, 512MiB, 5 RPS avg.",
                },
                {
                    "id": "B-02",
                    "name": "Cloud SQL Postgres",
                    "kind": "data",
                    "base_cost_usd": 150.0,
                    "scale_exp": {"users": 1.0, "gb": 0.5},
                    "fixed": False,
                    "free_tier_pct": None,
                    "cite": {"kind": "kb", "ref": "gcp.cloud-sql-postgres"},
                    "component_id": "gcp.cloud-sql-postgres",
                    "assumptions": "db-custom-1-4096, 100GB SSD.",
                },
            ],
            "monthly_baseline_usd": 215.0,
            "monthly_at_10x_usd": 1450.0,
            "monthly_at_100x_usd": 9800.0,
            "notes": None,
        }
    )


def _risks() -> Risks:
    return Risks.model_validate(
        {
            "risks": [
                {
                    "id": "R-01",
                    "title": "Cloud SQL HA gap in single-zone deployment",
                    "body": "Single-zone Cloud SQL means a zonal outage takes the app down for the recovery window.",
                    "category": "reliability",
                    "severity": "high",
                    "likelihood": "med",
                    "mitigation": "Enable HA configuration on Cloud SQL and document the failover RTO.",
                    "component_id": "gcp.cloud-sql-postgres",
                    "citations": [{"kind": "kb", "ref": "gcp.cloud-sql-postgres"}],
                },
                {
                    "id": "R-02",
                    "title": "PII residency drift",
                    "body": "Logs may contain PII and could be replicated outside the EU.",
                    "category": "compliance",
                    "severity": "med",
                    "likelihood": "med",
                    "mitigation": "Enable structured logging redaction and pin log sinks to EU regions.",
                    "component_id": None,
                    "citations": [{"kind": "finding", "ref": "RQ-01"}],
                },
            ],
            "notes": None,
        }
    )


def _good_inputs():
    return dict(
        run_id="run-123",
        brief="Build a B2B CRM for small EU sales teams.",
        normalized=_normalized(),
        requirements=_requirements(),
        synthesis=_synthesis(),
        architecture=_architecture(),
        cost=_cost(),
        risks=_risks(),
        findings=_findings(),
        kb_candidates=_kb(),
        generated_at=datetime(2026, 5, 14, 12, 0, tzinfo=UTC),
    )


# ─── happy path ───────────────────────────────────────────────────────


def test_package_happy_path_assembles_full_runpackage() -> None:
    pkg = package(**_good_inputs())
    assert isinstance(pkg, RunPackage)
    assert pkg.id == "run-123"
    assert pkg.generated_at == "2026-05-14T12:00:00+00:00"
    assert pkg.kb_snapshot_id == "kb-2026-05-12"
    assert pkg.brief.startswith("Build a B2B CRM")
    assert len(pkg.requirements) == 2
    assert len(pkg.assumptions) >= 1  # provenance defaults + Single-region
    assert len(pkg.nodes) == 4
    assert len(pkg.edges) == 3
    assert len(pkg.decisions) == 3
    assert len(pkg.bom) == 2
    assert len(pkg.risks) == 2
    assert len(pkg.flow_narrative) == 1
    assert len(pkg.roadmap) == 3
    assert len(pkg.sources) == 3  # cloud-run + cloud-sql + RQ-01 url


def test_sources_numbered_one_based_and_deduped_by_url() -> None:
    pkg = package(**_good_inputs())
    ids = [s.id for s in pkg.sources]
    assert ids == [1, 2, 3]
    urls = [s.url for s in pkg.sources]
    assert len(urls) == len(set(urls))
    # Order: first decision's first cite is gcp.cloud-run, next is gcp.cloud-sql-postgres,
    # then finding RQ-01.
    assert pkg.sources[0].url == "https://cloud.google.com/run"
    assert pkg.sources[1].url == "https://cloud.google.com/sql"
    assert pkg.sources[2].url == "https://example.com/pgvector"


def test_decision_cite_resolves_to_first_cite_index() -> None:
    pkg = package(**_good_inputs())
    by_id = {d.id: d for d in pkg.decisions}
    assert by_id["D-01"].cite == 1  # gcp.cloud-run -> source 1
    assert by_id["D-02"].cite == 2  # gcp.cloud-sql-postgres -> source 2 (first in list)
    assert by_id["D-03"].cite == 3  # finding RQ-01 -> source 3


def test_node_cite_resolves_correctly_including_finding() -> None:
    pkg = package(**_good_inputs())
    by_id = {n.id: n for n in pkg.nodes}
    assert by_id["N-01"].cite == 1
    assert by_id["N-02"].cite == 1
    assert by_id["N-03"].cite == 3  # finding RQ-01
    assert by_id["N-04"].cite == 1


def test_bom_cite_resolves_correctly() -> None:
    pkg = package(**_good_inputs())
    by_id = {b.id: b for b in pkg.bom}
    assert by_id["B-01"].cite == 1
    assert by_id["B-02"].cite == 2
    assert by_id["B-01"].base_cost == 60.0
    assert by_id["B-01"].scale_exp is not None
    assert by_id["B-01"].scale_exp.users == 1.0


def test_risk_cite_resolves_first_citation() -> None:
    pkg = package(**_good_inputs())
    by_id = {r.id: r for r in pkg.risks}
    assert by_id["R-01"].cite == 2
    assert by_id["R-02"].cite == 3


# ─── derived sections ─────────────────────────────────────────────────


def test_assumptions_extracted_from_provenance_defaults() -> None:
    pkg = package(**_good_inputs())
    texts = [a.text for a in pkg.assumptions]
    # provenance "default" entries: scale, latency, budget
    assert any("Scale" in t and "growing" in t for t in texts)
    assert any("Latency" in t and "standard" in t for t in texts)
    assert any("Budget" in t and "standard" in t for t in texts)
    # plus the Requirements.assumptions string
    assert any("Single-region" in t for t in texts)
    # ids monotonic
    ids = [a.id for a in pkg.assumptions]
    assert ids == sorted(ids)


def test_requirements_flattened_with_target_when_present() -> None:
    pkg = package(**_good_inputs())
    by_id = {r.id: r for r in pkg.requirements}
    assert by_id["FR-01"].label == "Capture leads"
    assert by_id["FR-01"].source == "brief"
    assert "(target: AES-256)" in by_id["NFR-01"].value


def test_roadmap_three_items_with_top_risks_named() -> None:
    pkg = package(**_good_inputs())
    assert len(pkg.roadmap) == 3
    assert pkg.roadmap[0].id == "RM-01"
    assert "Cloud SQL HA gap" in pkg.roadmap[1].body  # top high-severity
    # cost jump = (1450 - 215)/215 ≈ 574%
    assert "574%" in pkg.roadmap[2].body or "574" in pkg.roadmap[2].body


def test_snapshot_id_uses_max_last_verified_at() -> None:
    assert _derive_snapshot_id(_kb()) == "kb-2026-05-12"
    assert _derive_snapshot_id([]) == "kb-empty"


# ─── heuristics ───────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "topic, expected",
    [
        ("Compute runtime", "service"),
        ("Auth provider", "platform"),
        ("Primary database", "platform"),  # database hint wins over data
        ("Object storage", "data"),
        ("Job queue", "platform"),
    ],
)
def test_infer_blast_radius(topic: str, expected: str) -> None:
    d = Decision(
        id="D-99",
        topic=topic,
        pick="Pick",
        rationale="Reason long enough to satisfy validator.",
        alternatives=[],
        confidence="med",
        citations=[DecisionCitation(kind="kb", ref="gcp.cloud-run")],
    )
    assert _infer_blast_radius(d) == expected


@pytest.mark.parametrize(
    "topic, expected",
    [
        ("Primary database", "1-way"),
        ("Identity provider", "1-way"),
        ("Compute runtime", "2-way"),
        ("Edge / WAF", "2-way"),
    ],
)
def test_infer_reversibility(topic: str, expected: str) -> None:
    d = Decision(
        id="D-99",
        topic=topic,
        pick="Pick",
        rationale="Reason long enough to satisfy validator.",
        alternatives=[],
        confidence="med",
        citations=[DecisionCitation(kind="kb", ref="gcp.cloud-run")],
    )
    assert _infer_reversibility(d) == expected


@pytest.mark.parametrize(
    "conf, expected_substring",
    [
        ("low", "first month"),
        ("med", "10×"),
        ("high", "pricing or quotas"),
    ],
)
def test_infer_revisit_at_by_confidence(conf: str, expected_substring: str) -> None:
    d = Decision(
        id="D-99",
        topic="Topic",
        pick="Pick",
        rationale="Reason long enough to satisfy validator.",
        alternatives=[],
        confidence=conf,  # type: ignore[arg-type]
        citations=[DecisionCitation(kind="kb", ref="gcp.cloud-run")],
    )
    assert expected_substring in _infer_revisit_at(d)


def test_format_vs_with_alternatives_and_without() -> None:
    syn = _synthesis()
    d_with_alts = syn.decisions[0]
    d_without = syn.decisions[1]
    assert _format_vs(d_with_alts).startswith("vs ")
    assert "GKE Autopilot" in _format_vs(d_with_alts)
    assert _format_vs(d_without) == "vs no clear alternatives surfaced"


def test_publisher_from_url_strips_www_and_docs() -> None:
    assert _publisher_from_url("https://www.example.com/x") == "example.com"
    assert _publisher_from_url("https://docs.gcp.com/y") == "gcp.com"
    assert _publisher_from_url("not-a-url") == ""


# ─── error path ───────────────────────────────────────────────────────


def test_package_raises_on_unknown_kb_citation() -> None:
    inputs = _good_inputs()
    syn = inputs["synthesis"]
    syn.decisions[0].citations = [DecisionCitation(kind="kb", ref="nope.unknown")]
    with pytest.raises(PackagingError, match="unknown record"):
        package(**inputs)


def test_package_raises_on_unknown_finding_citation() -> None:
    inputs = _good_inputs()
    syn = inputs["synthesis"]
    syn.decisions[2].citations = [DecisionCitation(kind="finding", ref="RQ-99")]
    with pytest.raises(PackagingError, match="unknown question"):
        package(**inputs)


# ─── serialization ────────────────────────────────────────────────────


def test_runpackage_dumps_to_camelcase_json() -> None:
    pkg = package(**_good_inputs())
    data = pkg.model_dump(by_alias=True)
    # camelCase
    assert "generatedAt" in data
    assert "kbSnapshotId" in data
    assert "componentOptions" in data
    assert "flowNarrative" in data
    assert "from" in data["edges"][0]
    assert "src" not in data["edges"][0]
    assert "verifiedAt" in data["sources"][0]
    assert "blastRadius" in data["decisions"][0]
    assert "revisitAt" in data["decisions"][0]
    assert "baseCost" in data["bom"][0]
    assert "dataClass" in data["nodes"][0]
    assert "failureDomain" in data["nodes"][0]
    # JSON round-trip works
    json.dumps(data)


def test_render_markdown_contains_all_sections() -> None:
    pkg = package(**_good_inputs())
    md = render_markdown(pkg)
    for section in (
        "# TESSAR design package",
        "## Brief",
        "## Requirements",
        "## Assumptions",
        "## Decisions",
        "## Architecture",
        "### Components",
        "### Edges",
        "### Request flow",
        "## Bill of materials",
        "## Risks",
        "## Roadmap",
        "## Sources",
    ):
        assert section in md, f"missing section: {section}"
    # decisions reference numbered citations
    assert "[1]" in md
    assert "[2]" in md
    assert "[3]" in md
    # ends with a single trailing newline
    assert md.endswith("\n")
    assert not md.endswith("\n\n")


def test_render_markdown_brief_appears_verbatim() -> None:
    pkg = package(**_good_inputs())
    md = render_markdown(pkg)
    assert "Build a B2B CRM for small EU sales teams." in md
