"""Score every available RunPackage fixture against its matching scenario.

Convention: scenario `NNN-*.yaml` is paired with fixture `run-NNN.json`.
Scenarios without a fixture are SKIPPED with a warning — they don't
fail the suite (they just don't contribute). Once the orchestrator
gains a "score a real run" mode in Phase 5+, this runner will be the
nightly entry point per ADR-0008.

Usage:
    uv run python -m runners.score_suite                       # scores all
    uv run python -m runners.score_suite --json-out report.json
    uv run python -m runners.score_suite --kb-costs kb.json    # cost_realism

Exits 0 on suite pass, 1 on suite fail. The suite is defined by
`SUITE_PASS_RATE_THRESHOLD` + `SUITE_AGGREGATE_THRESHOLD` in
`rubric/scoring.py` (locked by ADR-0008).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import click
import yaml
from rubric.checks import cost_realism, groundedness, load_package, schema_validity
from rubric.scoring import (
    PER_SCENARIO_PASS_THRESHOLD,
    SUITE_AGGREGATE_THRESHOLD,
    SUITE_PASS_RATE_THRESHOLD,
    score_scenario,
    score_suite,
)

EVALS_ROOT = Path(__file__).resolve().parent.parent
SCENARIOS_DIR = EVALS_ROOT / "scenarios"
FIXTURES_DIR = EVALS_ROOT / "fixtures"


def _load_yaml(path: Path) -> dict:
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def _scenario_to_fixture(scenario_path: Path, fixtures_dir: Path = FIXTURES_DIR) -> Path:
    """`scenarios/001-b2b-saas-crm.yaml` → `<fixtures_dir>/run-001.json`. The
    numeric prefix is the join key (matches ADR-0008's reproducibility
    contract — re-running the same scenario must hit the same fixture)."""
    stem = scenario_path.stem  # 001-b2b-saas-crm
    prefix = stem.split("-", 1)[0]
    return fixtures_dir / f"run-{prefix}.json"


def _load_kb_costs(path: Path | None) -> dict[str, float]:
    if path is None:
        return {}
    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        raise click.ClickException(f"{path}: KB cost map must be a JSON object.")
    return {str(k): float(v) for k, v in raw.items()}


def _axis_to_dict(axis) -> dict:  # type: ignore[no-untyped-def]
    return {
        "axis": axis.axis,
        "score": axis.score,
        "findings": list(axis.findings),
    }


def _scenario_result_to_dict(r) -> dict:  # type: ignore[no-untyped-def]
    return {
        "scenario_id": r.scenario_id,
        "weighted_score": round(r.weighted_score, 3),
        "passed": r.passed,
        "failure_reasons": list(r.failure_reasons),
        "axes": {name: _axis_to_dict(axis) for name, axis in r.axes.items()},
    }


@click.command()
@click.option(
    "--scenarios-dir",
    type=click.Path(exists=True, file_okay=False, path_type=Path),
    default=SCENARIOS_DIR,
)
@click.option(
    "--fixtures-dir",
    type=click.Path(exists=True, file_okay=False, path_type=Path),
    default=FIXTURES_DIR,
)
@click.option(
    "--kb-costs",
    "kb_costs_path",
    type=click.Path(exists=True, dir_okay=False, path_type=Path),
    required=False,
    default=None,
)
@click.option(
    "--json-out",
    type=click.Path(dir_okay=False, path_type=Path),
    required=False,
    default=None,
    help="Write the structured suite report to this path as JSON.",
)
@click.option(
    "--allow-empty",
    is_flag=True,
    default=False,
    help="Exit 0 when no fixtures are present (default fails — empty suites "
    "should be explicit so a missing fixture directory cannot pass silently).",
)
def main(
    scenarios_dir: Path,
    fixtures_dir: Path,
    kb_costs_path: Path | None,
    json_out: Path | None,
    allow_empty: bool,
) -> None:
    """Score every scenario that has a paired fixture."""
    schema = _load_yaml(scenarios_dir / "_schema.yaml")  # noqa: F841 — kept for future strict validation
    kb_costs = _load_kb_costs(kb_costs_path)

    scenario_files = sorted(
        p for p in scenarios_dir.glob("*.yaml") if not p.name.startswith("_")
    )

    scenario_results = []
    skipped: list[str] = []
    for scenario_path in scenario_files:
        scenario = _load_yaml(scenario_path)
        scenario_id = scenario.get("id") or scenario_path.stem
        fixture_path = _scenario_to_fixture(scenario_path, fixtures_dir)
        if not fixture_path.exists():
            try:
                display = str(fixture_path.relative_to(EVALS_ROOT))
            except ValueError:
                display = str(fixture_path)
            click.secho(
                f"SKIP  {scenario_id}: no fixture at {display}",
                fg="yellow",
            )
            skipped.append(scenario_id)
            continue

        package = load_package(fixture_path)
        axes = [
            groundedness(package),
            schema_validity(package),
            cost_realism(package, kb_costs=kb_costs),
            # judged axes left to neutral 7.0 fill in scoring
        ]
        result = score_scenario(scenario_id, axes)
        scenario_results.append(result)

        verdict = (
            click.style("PASS", fg="green")
            if result.passed
            else click.style("FAIL", fg="red")
        )
        click.echo(f"{verdict}  {scenario_id}  weighted={result.weighted_score:.2f}/10")
        for reason in result.failure_reasons:
            click.echo(f"      - {reason}")

    if not scenario_results:
        if allow_empty:
            click.secho("no fixtures scored — exiting 0 (--allow-empty)", fg="yellow")
            if json_out:
                json_out.write_text(
                    json.dumps({"empty": True}, indent=2), encoding="utf-8"
                )
            sys.exit(0)
        click.secho(
            "no fixtures scored — empty suite. Add fixtures or pass --allow-empty.",
            fg="red",
            bold=True,
        )
        sys.exit(1)

    suite = score_suite(scenario_results)
    click.echo("")
    click.secho(
        f"SUITE  aggregate={suite.aggregate_score:.2f}/10  "
        f"pass-rate={suite.pass_rate:.0%}  "
        f"({sum(1 for r in scenario_results if r.passed)}/{len(scenario_results)})",
        fg="green" if suite.suite_passed else "red",
        bold=True,
    )
    click.echo(
        f"       bars: per-scenario ≥{PER_SCENARIO_PASS_THRESHOLD}  "
        f"suite-aggregate ≥{SUITE_AGGREGATE_THRESHOLD}  "
        f"suite-pass-rate ≥{SUITE_PASS_RATE_THRESHOLD:.0%}"
    )
    for reason in suite.failure_reasons:
        click.echo(f"       - {reason}")

    if json_out:
        report = {
            "aggregate_score": round(suite.aggregate_score, 3),
            "pass_rate": round(suite.pass_rate, 4),
            "suite_passed": suite.suite_passed,
            "n_scored": len(scenario_results),
            "n_skipped": len(skipped),
            "skipped_ids": skipped,
            "failure_reasons": list(suite.failure_reasons),
            "scenarios": [_scenario_result_to_dict(r) for r in scenario_results],
            "thresholds": {
                "per_scenario_pass": PER_SCENARIO_PASS_THRESHOLD,
                "suite_aggregate": SUITE_AGGREGATE_THRESHOLD,
                "suite_pass_rate": SUITE_PASS_RATE_THRESHOLD,
            },
        }
        json_out.parent.mkdir(parents=True, exist_ok=True)
        json_out.write_text(
            json.dumps(report, indent=2, sort_keys=False, default=str) + "\n",
            encoding="utf-8",
        )
        click.echo(f"\nreport written to {json_out}")

    sys.exit(0 if suite.suite_passed else 1)


# Re-export for tests.
__all__ = ["main", "_scenario_to_fixture", "_scenario_result_to_dict"]


if __name__ == "__main__":
    main()
