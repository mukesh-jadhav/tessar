"""Validate `kb-seed/components/*.yaml` against `kb-seed/_schema.yaml`.

Phase 3.1: also emits a flat `name -> baseline_usd_per_month` JSON map to
`reports/kb-cost-map.json` (or `--out`) so the `cost_realism` rubric axis
can be wired up via:

    python -m runners.score_run --scenario … --package … \\
        --kb-costs reports/kb-cost-map.json

Until Phase 3.2 (DB loader), this is the canonical KB-validity gate
that runs on every PR.
"""

from __future__ import annotations

import json
import sys
from datetime import date, timedelta
from pathlib import Path

import click
import yaml
from jsonschema import Draft202012Validator

KB_DIR = Path(__file__).resolve().parent.parent.parent / "kb-seed"
DEFAULT_OUT = Path(__file__).resolve().parent.parent / "reports" / "kb-cost-map.json"
FRESHNESS_SLA_DAYS = 90


def _load_yaml(path: Path) -> dict:
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def _stringify_dates(value):
    """PyYAML parses bare ISO dates into `datetime.date`; the JSON Schema
    `string + format: date` test wants strings. Coerce in-place before
    validating so authors don't have to quote every date in YAML."""
    if isinstance(value, dict):
        return {k: _stringify_dates(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_stringify_dates(v) for v in value]
    if isinstance(value, date):
        return value.isoformat()
    return value


@click.command()
@click.option(
    "--kb-dir",
    type=click.Path(exists=True, file_okay=False, path_type=Path),
    default=KB_DIR,
    help="Path to kb-seed/.",
)
@click.option(
    "--out",
    type=click.Path(dir_okay=False, path_type=Path),
    default=DEFAULT_OUT,
    help="Where to write the {component_name: baseline_usd_per_month} JSON map.",
)
@click.option(
    "--strict-freshness",
    is_flag=True,
    default=False,
    help="Fail if any record's last_verified_at is older than the 90-day SLA.",
)
def main(kb_dir: Path, out: Path, strict_freshness: bool) -> None:
    """Validate KB component records and emit a cost map."""
    schema_path = kb_dir / "_schema.yaml"
    if not schema_path.exists():
        raise click.ClickException(f"missing KB schema at {schema_path}")
    schema = _load_yaml(schema_path)
    validator = Draft202012Validator(schema)

    component_files = sorted((kb_dir / "components").glob("*.yaml"))
    if not component_files:
        raise click.ClickException(
            f"no component YAMLs found under {kb_dir / 'components'}"
        )

    cost_map: dict[str, float] = {}
    seen_ids: set[str] = set()
    any_failed = False
    today = date.today()
    sla_cutoff = today - timedelta(days=FRESHNESS_SLA_DAYS)

    for path in component_files:
        data = _stringify_dates(_load_yaml(path))

        # 1. JSON Schema
        errors = sorted(validator.iter_errors(data), key=lambda e: list(e.path))
        if errors:
            any_failed = True
            click.secho(f"FAIL  {path.name}", fg="red", bold=True)
            for e in errors:
                loc = "/".join(str(p) for p in e.path) or "<root>"
                click.echo(f"  - {loc}: {e.message}")
            continue

        # 2. id uniqueness (cross-file)
        rid = data["id"]
        if rid in seen_ids:
            any_failed = True
            click.secho(f"FAIL  {path.name}: duplicate id `{rid}`", fg="red", bold=True)
            continue
        seen_ids.add(rid)

        # 3. freshness
        verified_str = data["last_verified_at"]
        verified = (
            verified_str
            if isinstance(verified_str, date)
            else date.fromisoformat(str(verified_str))
        )
        stale = verified < sla_cutoff
        stale_label = "  [STALE]" if stale else ""
        if stale and strict_freshness:
            any_failed = True

        click.secho(
            f"OK    {path.name}{stale_label}", fg="yellow" if stale else "green"
        )

        # 4. cost map (component name → baseline)
        if "baseline_cost_usd_per_month" in data:
            cost_map[data["name"]] = float(data["baseline_cost_usd_per_month"])

    click.echo("")
    if any_failed:
        click.secho("KB validation FAILED", fg="red", bold=True)
        sys.exit(1)

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(cost_map, indent=2, sort_keys=True), encoding="utf-8")
    click.secho(f"all {len(component_files)} components validate cleanly", fg="green")
    click.echo(f"cost map -> {out} ({len(cost_map)} entries)")


if __name__ == "__main__":
    main()
