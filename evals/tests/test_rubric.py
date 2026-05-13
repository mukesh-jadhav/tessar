"""Smoke tests for the auto-checkable rubric axes.

These are pure unit tests — no LLM calls, no IO beyond loading inline
fixtures. Catch obvious regressions in the scoring math.
"""

from __future__ import annotations

from rubric.checks import cost_realism, groundedness, schema_validity
from rubric.scoring import (
    PER_SCENARIO_PASS_THRESHOLD,
    score_scenario,
    score_suite,
)

# ─── fixtures ────────────────────────────────────────────────────


def _well_formed_pkg() -> dict:
    return {
        "id": "00000000-0000-0000-0000-000000000000",
        "generatedAt": "2026-05-13T12:00:00Z",
        "kbSnapshotId": "kb-2026-05-12",
        "brief": "A small brief.",
        "requirements": [
            {"id": "r1", "label": "Users", "value": "200", "source": "brief"},
        ],
        "nodes": [
            {"id": "web", "label": "Cloud Run", "cite": 1},
            {"id": "db", "label": "Cloud SQL Postgres", "cite": 2},
        ],
        "decisions": [
            {
                "id": "d1",
                "topic": "DB",
                "pick": "Cloud SQL Postgres",
                "vs": "vs Neon · Supabase",
                "why": "managed Postgres on GCP, predictable cost",
                "conf": "high",
                "cite": 2,
                "reversibility": "1-way",
                "blastRadius": "data",
                "revisitAt": "when DAU > 50k",
            }
        ],
        "bom": [
            {
                "id": "b1",
                "name": "Cloud Run",
                "kind": "compute",
                "baseCost": 25.0,
                "cite": 1,
            },
            {
                "id": "b2",
                "name": "Cloud SQL Postgres",
                "kind": "data",
                "baseCost": 55.0,
                "cite": 2,
            },
        ],
        "risks": [
            {
                "id": "k1",
                "title": "DB single-zone failure",
                "severity": "med",
                "likelihood": "low",
                "mitigation": "enable HA in prod",
                "cite": 2,
            }
        ],
        "sources": [
            {
                "id": 1,
                "title": "Cloud Run pricing",
                "publisher": "GCP",
                "url": "https://x",
                "verifiedAt": "2026-05-01",
            },
            {
                "id": 2,
                "title": "Cloud SQL pricing",
                "publisher": "GCP",
                "url": "https://y",
                "verifiedAt": "2026-05-01",
            },
        ],
    }


# ─── groundedness ────────────────────────────────────────────────


def test_groundedness_full() -> None:
    pkg = _well_formed_pkg()
    s = groundedness(pkg)
    assert s.score == 10.0


def test_groundedness_missing_cite() -> None:
    pkg = _well_formed_pkg()
    pkg["nodes"][0]["cite"] = 0  # ungrounded
    s = groundedness(pkg)
    # 4 of 5 picks cited (web ungrounded, db, decision, 2 boms, 1 risk)
    assert 7.0 < s.score < 9.0


def test_groundedness_dangling_cite() -> None:
    pkg = _well_formed_pkg()
    pkg["nodes"][0]["cite"] = 99  # not in sources
    s = groundedness(pkg)
    assert s.score < 10.0
    assert any("dangling" in f for f in s.findings)


# ─── schema validity ────────────────────────────────────────────


def test_schema_validity_pass() -> None:
    pkg = _well_formed_pkg()
    s = schema_validity(pkg)
    assert s.score == 10.0


def test_schema_validity_fail_missing_required() -> None:
    pkg = _well_formed_pkg()
    del pkg["id"]
    s = schema_validity(pkg)
    assert s.score == 0.0


# ─── cost realism ───────────────────────────────────────────────


def test_cost_realism_no_kb_returns_neutral_max() -> None:
    pkg = _well_formed_pkg()
    s = cost_realism(pkg, kb_costs={})
    assert s.score == 10.0


def test_cost_realism_within_tolerance() -> None:
    pkg = _well_formed_pkg()
    kb = {"Cloud Run": 25.0, "Cloud SQL Postgres": 55.0}
    s = cost_realism(pkg, kb_costs=kb)
    assert s.score == 10.0


def test_cost_realism_outside_tolerance() -> None:
    pkg = _well_formed_pkg()
    kb = {"Cloud Run": 25.0, "Cloud SQL Postgres": 1000.0}  # absurdly off
    s = cost_realism(pkg, kb_costs=kb)
    assert s.score == 5.0  # 1 of 2 within tolerance


# ─── scoring aggregation ────────────────────────────────────────


def test_score_scenario_passes_with_neutral_judges() -> None:
    pkg = _well_formed_pkg()
    axes = [groundedness(pkg), schema_validity(pkg), cost_realism(pkg, kb_costs={})]
    result = score_scenario("001-test", axes)
    # Auto axes all 10 + neutral 7.0 fill for 3 judged axes (0.5 weight)
    # weighted = 10 * 0.5 + 7.0 * 0.5 = 8.5 → passes
    assert result.weighted_score >= PER_SCENARIO_PASS_THRESHOLD
    assert result.passed


def test_suite_passes_with_three_passing_scenarios() -> None:
    pkg = _well_formed_pkg()
    axes = lambda: [
        groundedness(pkg),
        schema_validity(pkg),
        cost_realism(pkg, kb_costs={}),
    ]
    results = [score_scenario(f"{i:03d}-test", axes()) for i in range(1, 4)]
    suite = score_suite(results)
    assert suite.suite_passed
    assert suite.pass_rate == 1.0
