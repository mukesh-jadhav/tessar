"""Database access for the orchestrator.

Per ADR-0007:

* Prisma (web) owns the schema and the migrations.
* This package mirrors the **subset of tables the worker touches** as
  read-mostly SQLAlchemy 2.x models. Writes are limited to ``run_events``
  and ``run_artifacts``; everything else must be opened read-only.

The schema-drift check (``scripts/check_schema_drift.py``) introspects the
live Postgres and asserts that this mirror still matches it.
"""

from tessar.db.engine import get_engine, get_sessionmaker
from tessar.db.models import (
    ArtifactKind,
    Base,
    KbComponent,
    KbPattern,
    KbReferenceArch,
    Run,
    RunArtifact,
    RunEvent,
    RunStatus,
    User,
)

__all__ = [
    "ArtifactKind",
    "Base",
    "KbComponent",
    "KbPattern",
    "KbReferenceArch",
    "Run",
    "RunArtifact",
    "RunEvent",
    "RunStatus",
    "User",
    "get_engine",
    "get_sessionmaker",
]
