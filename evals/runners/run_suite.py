"""Run the full eval suite.

Phase 3.0: stub. The real implementation lands in Phase 3.4 once the LLM
router (3.2) and the first end-to-end agent slice (3.3) make it possible to
actually fire runs from a scenario.

What this stub does today:
- Loads + validates every `scenarios/*.yaml` (excluding `_*.yaml`) against
  `scenarios/_schema.yaml`.
- Reports any scenario file that fails schema validation.
- Returns exit-code 1 on validation failure, 0 otherwise.

This is enough to wire into PR-CI today as a "scenarios are well-formed"
gate without needing any LLM calls.
"""

from __future__ import annotations

import sys
from pathlib import Path

import click
import yaml
from jsonschema import Draft202012Validator

SCENARIOS_DIR = Path(__file__).resolve().parent.parent / "scenarios"


def _load_yaml(path: Path) -> dict:
    return yaml.safe_load(path.read_text(encoding="utf-8"))


@click.command()
@click.option(
    "--scenarios-dir",
    type=click.Path(exists=True, file_okay=False, path_type=Path),
    default=SCENARIOS_DIR,
    help="Directory of scenario YAML files.",
)
def main(scenarios_dir: Path) -> None:
    """Validate every scenario file. Returns non-zero on any failure."""
    schema_path = scenarios_dir / "_schema.yaml"
    if not schema_path.exists():
        raise click.ClickException(f"missing scenario JSON Schema at {schema_path}")
    schema = _load_yaml(schema_path)
    validator = Draft202012Validator(schema)

    scenario_files = sorted(
        p for p in scenarios_dir.glob("*.yaml") if not p.name.startswith("_")
    )
    if not scenario_files:
        raise click.ClickException(f"no scenario files found in {scenarios_dir}")

    any_failed = False
    for path in scenario_files:
        data = _load_yaml(path)
        errors = sorted(validator.iter_errors(data), key=lambda e: list(e.path))
        if errors:
            any_failed = True
            click.secho(f"FAIL  {path.name}", fg="red", bold=True)
            for e in errors:
                loc = "/".join(str(p) for p in e.path) or "<root>"
                click.echo(f"  - {loc}: {e.message}")
        else:
            click.secho(f"OK    {path.name}", fg="green")

    click.echo("")
    if any_failed:
        click.secho("scenario validation FAILED", fg="red", bold=True)
        click.echo(
            "Phase 3.4 will extend this runner to fire orchestrator runs and score them."
        )
        sys.exit(1)
    click.secho(f"all {len(scenario_files)} scenarios validate cleanly", fg="green")
    click.echo(
        "Phase 3.4 will extend this runner to fire orchestrator runs and score them."
    )


if __name__ == "__main__":
    main()
