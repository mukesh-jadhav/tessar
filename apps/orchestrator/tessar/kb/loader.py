"""KB loader.

Reads `kb-seed/components/*.yaml` from the repo root, validates each
against `KbRecord`, returns an in-memory list. The eval-runner already
gates the JSON-Schema correctness in CI; here we just trust + parse.

Cached at module level so a hot orchestrator process loads the KB
exactly once. Tests can pass `path=` to point at a fixture directory.
"""

from __future__ import annotations

from datetime import date
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

from .types import KbRecord


def _stringify_dates(value: Any) -> Any:
    """PyYAML parses bare ISO dates into `datetime.date`; Pydantic
    accepts both, but downstream JSON serialization is happier with
    strings. Mirrors `evals/runners/validate_kb.py::_stringify_dates`.
    """
    if isinstance(value, dict):
        return {k: _stringify_dates(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_stringify_dates(v) for v in value]
    if isinstance(value, date):
        return value.isoformat()
    return value


def _default_kb_dir() -> Path:
    """Repo-root resolved from this file: kb=0, tessar=1, orchestrator=2,
    apps=3, repo=4."""
    return Path(__file__).resolve().parents[4] / "kb-seed" / "components"


def load_kb(path: Path | None = None) -> list[KbRecord]:
    """Load all KB component records from a directory of YAML files."""
    kb_dir = path if path is not None else _default_kb_dir()
    if not kb_dir.is_dir():
        raise FileNotFoundError(f"KB directory not found: {kb_dir}")

    records: list[KbRecord] = []
    for yaml_path in sorted(kb_dir.glob("*.yaml")):
        raw = yaml.safe_load(yaml_path.read_text(encoding="utf-8"))
        records.append(KbRecord.model_validate(raw))
    return records


@lru_cache(maxsize=1)
def get_kb() -> tuple[KbRecord, ...]:
    """Cached load of the on-disk KB. Tuple so the cache value is
    hashable + immutable; callers wanting a list should `list(...)` it."""
    return tuple(load_kb())
