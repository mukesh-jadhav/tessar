"""Filesystem helpers for locating repo-root assets (prompts, KB).

In dev, agents resolve `Path(__file__).parents[4]` to find the repo root.
In the Cloud Run container, the orchestrator sources live at
`/app/tessar/...` and the bundled assets live at `/app/packages/prompts/`
and `/app/kb-seed/`, so `parents[4]` overflows.

Set `TESSAR_REPO_ROOT=/app` in the container to override.
"""

from __future__ import annotations

import os
from pathlib import Path

_HERE = Path(__file__).resolve()


def repo_root() -> Path:
    """Return the directory that contains ``packages/`` and ``kb-seed/``."""
    override = os.environ.get("TESSAR_REPO_ROOT")
    if override:
        return Path(override)
    # apps/orchestrator/tessar/paths.py → parents[3] is the repo root.
    return _HERE.parents[3]
