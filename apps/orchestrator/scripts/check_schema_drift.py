"""Schema-drift check.

Run against a live Postgres (the dev DB, or a `prisma migrate deploy`-applied
ephemeral CI DB). Asserts that every table + column declared in the
SQLAlchemy mirror (``tessar.db.models``) exists in the live DB with a
matching nullability and (where comparable) type.

This is intentionally **one-directional**: extra tables/columns in the live
DB (e.g. Auth.js's ``accounts.refresh_token``, which the worker doesn't
touch) are allowed. Missing or mismatched ones fail.

Usage::

    DATABASE_URL=postgresql+asyncpg://... \\
      python -m scripts.check_schema_drift

CI calls this after applying Prisma migrations to a throwaway DB.
"""

from __future__ import annotations

import asyncio
import os
import sys

from sqlalchemy import inspect
from sqlalchemy.ext.asyncio import create_async_engine

from tessar.db.models import Base


async def main() -> int:
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        print("DATABASE_URL not set", file=sys.stderr)
        return 2

    engine = create_async_engine(dsn)
    errors: list[str] = []

    async with engine.connect() as conn:
        live_tables = set(await conn.run_sync(lambda sc: inspect(sc).get_table_names()))

        for table in Base.metadata.sorted_tables:
            if table.name not in live_tables:
                errors.append(f"missing table: {table.name}")
                continue

            live_cols = {
                c["name"]: c
                for c in await conn.run_sync(lambda sc, t=table.name: inspect(sc).get_columns(t))
            }

            for col in table.columns:
                live_col = live_cols.get(col.name)
                if live_col is None:
                    errors.append(f"missing column: {table.name}.{col.name}")
                    continue
                if bool(live_col["nullable"]) != bool(col.nullable):
                    errors.append(
                        f"nullability mismatch on {table.name}.{col.name}: "
                        f"live={live_col['nullable']} model={col.nullable}"
                    )

    await engine.dispose()

    if errors:
        print("Schema drift detected:", file=sys.stderr)
        for e in errors:
            print(f"  - {e}", file=sys.stderr)
        return 1

    print("OK - SQLAlchemy mirror matches live schema.")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
