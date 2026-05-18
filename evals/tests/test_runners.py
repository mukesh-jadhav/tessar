"""Tests for `runners.score_suite` and `runners.check_baseline`.

These exercise the runners as CLI scripts via Click's CliRunner so we
also cover the YAML/JSON IO and the exit-code contract that CI relies on.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from click.testing import CliRunner

from runners.check_baseline import main as check_baseline_cli
from runners.score_suite import _scenario_to_fixture
from runners.score_suite import main as score_suite_cli

EVALS_ROOT = Path(__file__).resolve().parent.parent
COMMITTED_SCENARIOS = EVALS_ROOT / "scenarios"
COMMITTED_FIXTURES = EVALS_ROOT / "fixtures"
COMMITTED_BASELINE = EVALS_ROOT / "reports" / "baseline.json"


# ─── _scenario_to_fixture ────────────────────────────────────────


def test_scenario_to_fixture_uses_numeric_prefix() -> None:
    """`001-foo.yaml` must pair with `run-001.json` — this is the join
    key downstream tools (incl. the nightly workflow report aggregator)
    rely on."""
    path = COMMITTED_SCENARIOS / "001-b2b-saas-crm.yaml"
    fixture = _scenario_to_fixture(path)
    assert fixture.name == "run-001.json"
    assert fixture.parent.name == "fixtures"


def test_scenario_to_fixture_handles_missing_dash() -> None:
    fixture = _scenario_to_fixture(Path("scenarios/999.yaml"))
    assert fixture.name == "run-999.json"


# ─── score_suite CLI ─────────────────────────────────────────────


def test_score_suite_writes_report_for_committed_fixtures(tmp_path: Path) -> None:
    """The committed scenario 001 has a paired fixture; score_suite
    should write a well-formed report and exit 0 (suite passes)."""
    out = tmp_path / "report.json"
    runner = CliRunner()
    result = runner.invoke(
        score_suite_cli,
        [
            "--scenarios-dir",
            str(COMMITTED_SCENARIOS),
            "--fixtures-dir",
            str(COMMITTED_FIXTURES),
            "--json-out",
            str(out),
        ],
    )
    assert result.exit_code == 0, result.output
    assert out.exists()
    report = json.loads(out.read_text(encoding="utf-8"))
    assert report["n_scored"] >= 1
    assert report["suite_passed"] is True
    assert 0.0 <= report["pass_rate"] <= 1.0
    assert 0.0 <= report["aggregate_score"] <= 10.0
    assert report["thresholds"]["per_scenario_pass"] == pytest.approx(7.0)
    # Every scored scenario carries its axes structurally.
    for s in report["scenarios"]:
        assert "scenario_id" in s
        assert "weighted_score" in s
        assert isinstance(s["axes"], dict)


def test_score_suite_skips_scenarios_without_fixtures(tmp_path: Path) -> None:
    """Scenarios without a paired fixture must be SKIPPED, not failed,
    so the suite can grow ahead of fixtures."""
    fixtures_dir = tmp_path / "empty_fixtures"
    fixtures_dir.mkdir()
    out = tmp_path / "report.json"
    runner = CliRunner()
    result = runner.invoke(
        score_suite_cli,
        [
            "--scenarios-dir",
            str(COMMITTED_SCENARIOS),
            "--fixtures-dir",
            str(fixtures_dir),
            "--json-out",
            str(out),
            "--allow-empty",
        ],
    )
    assert result.exit_code == 0, result.output
    # --allow-empty path writes the sentinel marker, not a full report.
    payload = json.loads(out.read_text(encoding="utf-8"))
    assert payload == {"empty": True}


def test_score_suite_empty_without_allow_flag_fails(tmp_path: Path) -> None:
    """Empty suites should fail loudly unless --allow-empty is set —
    silent passing on missing fixtures was the 4d0f4b7-style failure
    mode we're explicitly defending against."""
    fixtures_dir = tmp_path / "empty_fixtures"
    fixtures_dir.mkdir()
    runner = CliRunner()
    result = runner.invoke(
        score_suite_cli,
        [
            "--scenarios-dir",
            str(COMMITTED_SCENARIOS),
            "--fixtures-dir",
            str(fixtures_dir),
        ],
    )
    assert result.exit_code == 1
    assert "empty suite" in result.output


# ─── check_baseline CLI ──────────────────────────────────────────


def _write(p: Path, payload: dict) -> Path:
    p.write_text(json.dumps(payload), encoding="utf-8")
    return p


def _baseline(aggregate: float, scenarios: list[dict] | None = None) -> dict:
    return {
        "aggregate_score": aggregate,
        "pass_rate": 1.0,
        "suite_passed": True,
        "n_scored": 1,
        "n_skipped": 0,
        "skipped_ids": [],
        "failure_reasons": [],
        "scenarios": scenarios
        or [
            {
                "scenario_id": "s1",
                "weighted_score": aggregate,
                "passed": True,
                "failure_reasons": [],
                "axes": {},
            }
        ],
        "thresholds": {
            "per_scenario_pass": 7.0,
            "suite_aggregate": 7.5,
            "suite_pass_rate": 0.8,
        },
    }


def test_check_baseline_passes_when_no_regression(tmp_path: Path) -> None:
    base = _write(tmp_path / "base.json", _baseline(8.0))
    rpt = _write(tmp_path / "rpt.json", _baseline(8.0))
    result = CliRunner().invoke(
        check_baseline_cli, ["--report", str(rpt), "--baseline", str(base)]
    )
    assert result.exit_code == 0, result.output
    assert "no regression" in result.output


def test_check_baseline_passes_on_improvement(tmp_path: Path) -> None:
    """Improvements must not fail the gate — the tolerance is one-sided."""
    base = _write(tmp_path / "base.json", _baseline(7.5))
    rpt = _write(tmp_path / "rpt.json", _baseline(9.5))
    result = CliRunner().invoke(
        check_baseline_cli, ["--report", str(rpt), "--baseline", str(base)]
    )
    assert result.exit_code == 0, result.output


def test_check_baseline_passes_at_tolerance_boundary(tmp_path: Path) -> None:
    """A 0.5-point drop is exactly the tolerance and must pass; only
    `> 0.5` regresses (matches `is_regression` semantics)."""
    base = _write(tmp_path / "base.json", _baseline(8.0))
    rpt = _write(tmp_path / "rpt.json", _baseline(7.5))
    result = CliRunner().invoke(
        check_baseline_cli, ["--report", str(rpt), "--baseline", str(base)]
    )
    assert result.exit_code == 0, result.output


def test_check_baseline_fails_beyond_tolerance(tmp_path: Path) -> None:
    base = _write(tmp_path / "base.json", _baseline(8.0))
    rpt = _write(tmp_path / "rpt.json", _baseline(7.0))  # -1.0
    result = CliRunner().invoke(
        check_baseline_cli, ["--report", str(rpt), "--baseline", str(base)]
    )
    assert result.exit_code == 1
    assert "REGRESSION" in result.output


def test_check_baseline_fails_on_missing_scenario(tmp_path: Path) -> None:
    """A scenario in baseline but missing from report = silent regression."""
    base = _write(
        tmp_path / "base.json",
        _baseline(
            8.0,
            scenarios=[
                {
                    "scenario_id": "s1",
                    "weighted_score": 8.0,
                    "passed": True,
                    "failure_reasons": [],
                    "axes": {},
                },
                {
                    "scenario_id": "s2",
                    "weighted_score": 8.0,
                    "passed": True,
                    "failure_reasons": [],
                    "axes": {},
                },
            ],
        ),
    )
    rpt = _write(
        tmp_path / "rpt.json",
        _baseline(
            8.0,
            scenarios=[
                {
                    "scenario_id": "s1",
                    "weighted_score": 8.0,
                    "passed": True,
                    "failure_reasons": [],
                    "axes": {},
                }
            ],
        ),
    )
    result = CliRunner().invoke(
        check_baseline_cli, ["--report", str(rpt), "--baseline", str(base)]
    )
    assert result.exit_code == 1
    assert "s2" in result.output


def test_check_baseline_flags_per_scenario_regression(tmp_path: Path) -> None:
    """Aggregate may pass while one scenario tanks — the per-scenario
    check catches that case (defends against suite averaging hiding regressions)."""
    base = _write(
        tmp_path / "base.json",
        _baseline(
            8.0,
            scenarios=[
                {
                    "scenario_id": "s1",
                    "weighted_score": 9.5,
                    "passed": True,
                    "failure_reasons": [],
                    "axes": {},
                },
                {
                    "scenario_id": "s2",
                    "weighted_score": 6.5,
                    "passed": True,
                    "failure_reasons": [],
                    "axes": {},
                },
            ],
        ),
    )
    rpt = _write(
        tmp_path / "rpt.json",
        _baseline(
            8.0,
            scenarios=[
                {
                    "scenario_id": "s1",
                    "weighted_score": 9.5,
                    "passed": True,
                    "failure_reasons": [],
                    "axes": {},
                },
                {
                    "scenario_id": "s2",
                    "weighted_score": 5.0,
                    "passed": False,
                    "failure_reasons": [],
                    "axes": {},
                },
            ],
        ),
    )
    result = CliRunner().invoke(
        check_baseline_cli, ["--report", str(rpt), "--baseline", str(base)]
    )
    assert result.exit_code == 1
    assert "s2" in result.output


def test_check_baseline_rejects_empty_report(tmp_path: Path) -> None:
    base = _write(tmp_path / "base.json", _baseline(8.0))
    rpt = _write(tmp_path / "rpt.json", {"empty": True})
    result = CliRunner().invoke(
        check_baseline_cli, ["--report", str(rpt), "--baseline", str(base)]
    )
    # ClickException returns exit 1, not the click "Usage" exit 2.
    assert result.exit_code != 0
    assert "empty" in result.output.lower()


def test_committed_baseline_is_well_formed() -> None:
    """The committed baseline.json must always be parseable + carry the
    fields downstream consumers rely on. If this fails, we've shipped
    a broken baseline file — refuse to merge."""
    assert COMMITTED_BASELINE.exists(), "evals/reports/baseline.json must be committed"
    payload = json.loads(COMMITTED_BASELINE.read_text(encoding="utf-8"))
    assert "aggregate_score" in payload
    assert "scenarios" in payload and isinstance(payload["scenarios"], list)
    assert payload["aggregate_score"] >= 7.5, (
        f"committed baseline {payload['aggregate_score']} below suite bar — "
        "regenerate baseline before merging"
    )
