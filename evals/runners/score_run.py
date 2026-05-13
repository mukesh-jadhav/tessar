"""Score a single completed `RunPackage` JSON file against one scenario.

Usage:
    uv run python -m runners.score_run \\
        --scenario scenarios/001-b2b-saas-crm.yaml \\
        --package fixtures/run-001.json

Phase 3.0: only the auto-checkable axes (groundedness, schema_validity,
cost_realism) are evaluated. Judged axes (coherence, tradeoff_quality,
brief_fidelity) return `None` and the suite scorer fills them with the
neutral 7.0 placeholder until the LLM router is wired in Phase 3.2+.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import click
import yaml
from rubric.checks import cost_realism, groundedness, load_package, schema_validity
from rubric.scoring import score_scenario


def _load_scenario(path: Path) -> dict:
    """Load + lightly validate a scenario YAML. Full JSON-Schema validation
    happens in `run_suite` when iterating; here we only check id/brief
    so single-file scoring is fast."""
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise click.ClickException(
            f"{path}: scenario must be a YAML mapping at top level."
        )
    for k in ("id", "brief", "requirements", "max_cost_usd"):
        if k not in data:
            raise click.ClickException(f"{path}: missing required key `{k}`.")
    return data


def _load_kb_costs(path: Path | None) -> dict[str, float]:
    """Optional: load a `name -> baseline_usd_per_month` map from JSON.
    Until Phase 3.1 KB seed lands, callers will pass nothing and the
    cost_realism axis self-skips with a 10/10 placeholder."""
    if path is None:
        return {}
    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        raise click.ClickException(f"{path}: KB cost map must be a JSON object.")
    return {str(k): float(v) for k, v in raw.items()}


@click.command()
@click.option(
    "--scenario",
    "scenario_path",
    type=click.Path(exists=True, dir_okay=False, path_type=Path),
    required=True,
    help="Path to the scenario YAML.",
)
@click.option(
    "--package",
    "package_path",
    type=click.Path(exists=True, dir_okay=False, path_type=Path),
    required=True,
    help="Path to the RunPackage JSON to score.",
)
@click.option(
    "--kb-costs",
    "kb_costs_path",
    type=click.Path(exists=True, dir_okay=False, path_type=Path),
    required=False,
    default=None,
    help="Optional JSON map of {component_name: baseline_usd_per_month} for cost_realism. "
    "Until Phase 3.1 KB seed lands, omit this and cost_realism returns 10/10.",
)
@click.option(
    "--json-out",
    type=click.Path(dir_okay=False, path_type=Path),
    required=False,
    default=None,
    help="If set, write the structured scoring result to this path as JSON.",
)
def main(
    scenario_path: Path,
    package_path: Path,
    kb_costs_path: Path | None,
    json_out: Path | None,
) -> None:
    """Score one RunPackage against one scenario."""
    scenario = _load_scenario(scenario_path)
    package = load_package(package_path)
    kb_costs = _load_kb_costs(kb_costs_path)

    axes = [
        groundedness(package),
        schema_validity(package),
        cost_realism(package, kb_costs=kb_costs),
        # judged axes deliberately omitted — neutral 7.0 fill in scoring
    ]
    result = score_scenario(scenario["id"], axes)

    # Pretty CLI summary
    click.secho(f"\nScenario: {result.scenario_id}", bold=True)
    click.secho(f"Weighted score: {result.weighted_score:.2f} / 10", bold=True)
    click.secho(
        f"Passed: {'YES' if result.passed else 'NO'}",
        fg="green" if result.passed else "red",
    )
    click.echo("")
    for name, axis in result.axes.items():
        click.secho(f"  [{name}] {axis.score:.2f}", fg="cyan")
        for f in axis.findings:
            click.echo(f"    - {f}")
    if result.failure_reasons:
        click.echo("")
        click.secho("Failure reasons:", fg="red", bold=True)
        for r in result.failure_reasons:
            click.echo(f"  - {r}")

    if json_out is not None:
        payload = {
            "scenario_id": result.scenario_id,
            "weighted_score": result.weighted_score,
            "passed": result.passed,
            "failure_reasons": result.failure_reasons,
            "axes": {
                name: {"score": a.score, "findings": a.findings}
                for name, a in result.axes.items()
            },
        }
        json_out.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        click.echo(f"\nWrote JSON report to {json_out}")

    sys.exit(0 if result.passed else 1)


if __name__ == "__main__":
    main()
