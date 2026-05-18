"""Compare a fresh suite report to the committed baseline.

Used by the nightly eval workflow (see `.github/workflows/eval-nightly.yml`)
and as a PR gate to catch regressions. Locks ADR-0008's contract:

  - aggregate may drift down by at most `REGRESSION_TOLERANCE` (0.5).
  - per-scenario aggregate may not drop by more than that tolerance either
    (a single bad scenario should not be hidden by suite averaging).
  - new scenarios in the report (not in the baseline) are allowed and
    contribute to the new baseline-candidate.
  - scenarios in the baseline but missing from the report are FATAL —
    silently dropping a scenario from CI is a regression too.

Baseline format = a `score_suite --json-out` report.

Usage:
    uv run python -m runners.check_baseline \\
        --report reports/latest.json \\
        --baseline reports/baseline.json

Exit codes: 0 on no regression, 1 on regression, 2 on bad input.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import click
from rubric.scoring import REGRESSION_TOLERANCE


def _load_report(path: Path, label: str) -> dict:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        raise click.ClickException(f"{label} {path}: invalid JSON: {e}") from e
    if data.get("empty"):
        raise click.ClickException(
            f"{label} {path}: marked empty=true — cannot compare empty reports."
        )
    if "aggregate_score" not in data or "scenarios" not in data:
        raise click.ClickException(
            f"{label} {path}: missing required fields aggregate_score/scenarios."
        )
    return data


def _scenarios_by_id(report: dict) -> dict[str, dict]:
    return {s["scenario_id"]: s for s in report["scenarios"]}


@click.command()
@click.option(
    "--report",
    "report_path",
    type=click.Path(exists=True, dir_okay=False, path_type=Path),
    required=True,
    help="Fresh suite report JSON (output of `score_suite --json-out`).",
)
@click.option(
    "--baseline",
    "baseline_path",
    type=click.Path(exists=True, dir_okay=False, path_type=Path),
    required=True,
    help="Committed baseline report JSON to compare against.",
)
@click.option(
    "--tolerance",
    type=float,
    default=REGRESSION_TOLERANCE,
    show_default=True,
    help="Absolute-point drop above which a regression is reported. "
    "Defaults to ADR-0008's locked value.",
)
def main(report_path: Path, baseline_path: Path, tolerance: float) -> None:
    """Fail if the report regresses beyond `tolerance` vs the baseline."""
    report = _load_report(report_path, "report")
    baseline = _load_report(baseline_path, "baseline")

    report_aggregate = float(report["aggregate_score"])
    baseline_aggregate = float(baseline["aggregate_score"])
    delta = report_aggregate - baseline_aggregate

    click.echo(
        f"baseline aggregate = {baseline_aggregate:.3f}\n"
        f"report   aggregate = {report_aggregate:.3f}\n"
        f"delta              = {delta:+.3f}  (tolerance = {tolerance})"
    )

    regressions: list[str] = []
    if -delta > tolerance:
        regressions.append(
            f"suite aggregate dropped {-delta:.3f} (>{tolerance}) — "
            f"{baseline_aggregate:.3f} → {report_aggregate:.3f}"
        )

    # Per-scenario checks.
    baseline_scenarios = _scenarios_by_id(baseline)
    report_scenarios = _scenarios_by_id(report)

    missing = sorted(set(baseline_scenarios) - set(report_scenarios))
    if missing:
        regressions.append(
            f"scenarios present in baseline but missing from report: {', '.join(missing)}"
        )

    common = sorted(set(baseline_scenarios) & set(report_scenarios))
    for sid in common:
        b = float(baseline_scenarios[sid]["weighted_score"])
        r = float(report_scenarios[sid]["weighted_score"])
        sdelta = r - b
        marker = (
            click.style("OK  ", fg="green")
            if -sdelta <= tolerance
            else click.style("FAIL", fg="red")
        )
        click.echo(f"  {marker} {sid}  {b:.2f} → {r:.2f}  ({sdelta:+.2f})")
        if -sdelta > tolerance:
            regressions.append(
                f"scenario `{sid}` dropped {-sdelta:.3f} (>{tolerance}) — {b:.3f} → {r:.3f}"
            )

    new_in_report = sorted(set(report_scenarios) - set(baseline_scenarios))
    if new_in_report:
        click.secho(
            f"  NEW   {len(new_in_report)} scenario(s) in report not in baseline: "
            f"{', '.join(new_in_report)}",
            fg="yellow",
        )

    click.echo("")
    if regressions:
        click.secho("REGRESSION", fg="red", bold=True)
        for r in regressions:
            click.echo(f"  - {r}")
        sys.exit(1)

    click.secho("no regression", fg="green", bold=True)
    sys.exit(0)


if __name__ == "__main__":
    main()
