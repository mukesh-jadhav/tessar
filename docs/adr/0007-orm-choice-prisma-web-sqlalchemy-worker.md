# ADR-0007: ORM Choice — Prisma (web) + Read-Only SQLAlchemy (orchestrator)

- **Status:** Accepted
- **Date:** 2026-05-13
- **Deciders:** founder

## Context

Phase 2 ([IMPLEMENTATION.md](../../IMPLEMENTATION.md) §5.1) introduces a real
Cloud SQL Postgres 16 (+ pgvector) database shared by both deployable
services:

- `tessar-web` (Next.js 15 + TypeScript on Cloud Run) owns the schema —
  user tables, run lifecycle, Stripe (later), Auth.js adapter tables.
- `tessar-orchestrator` (Python 3.12 + LangGraph on Cloud Run) writes
  `run_events` + `run_artifacts` rows, reads the rest.

The IMPLEMENTATION doc names two candidates without locking one:

> "Drizzle on web side + SQLAlchemy/Alembic or raw SQL on worker side —
> pick one and own it; recommend **Prisma on web** since it owns the schema,
> **read-only SQLAlchemy on worker**."

We need a single, locked answer before writing migrations.

## Decision

- **Web (`tessar-web`)**: **Prisma** (latest stable). Owns the canonical
  schema in `apps/web/prisma/schema.prisma`. All migrations are generated,
  reviewed, and applied from the web service. Auth.js uses the official
  Prisma adapter (no separate Auth.js schema dialect to maintain).
- **Worker (`tessar-orchestrator`)**: **SQLAlchemy 2.x (async, read-mostly)**
  with models hand-mirrored from Prisma's schema in
  `apps/orchestrator/tessar/db/models.py`. The worker writes only to
  `run_events` and `run_artifacts`; everything else is read-only.
- **Migrations**: Prisma is the single source of migration truth.
  SQLAlchemy models are kept in sync by a CI check that diffs Prisma's
  introspected schema against SQLAlchemy's declared metadata; mismatches
  fail the build.
- **pgvector columns**: declared via `Unsupported("vector(1536)")` in
  Prisma (Prisma has no first-class vector type yet) and as
  `pgvector.sqlalchemy.Vector(1536)` in SQLAlchemy. Vector indexes
  (`ivfflat` / `hnsw`) are created via raw SQL inside Prisma migrations,
  not via the Prisma DSL.

## Alternatives considered

- **Drizzle on web + SQLAlchemy on worker.** Drizzle is faster at runtime
  and has tidier TypeScript types, but its Auth.js adapter is younger and
  its migration story for shared schemas is less battle-tested than
  Prisma's. We choose stability over micro-optimisation for MVP.
- **Raw SQL on the worker (no ORM).** Tempting because the worker's
  surface is small (two write tables + a few reads). Rejected because
  the keep-in-sync check is much harder to write against ad-hoc SQL
  strings, and we lose typed query results in agent code.
- **Single ORM across both languages (e.g. via shared schema files).**
  No mature Python+TypeScript shared-ORM exists; the cure is worse
  than the disease.

## Consequences

**Positive**

- One canonical schema, one migration runner.
- Auth.js works out-of-the-box.
- Worker code stays in idiomatic Python with typed models.

**Negative / risks**

- Prisma + pgvector is awkward; vector ops have to live in raw SQL or
  in worker code. Acceptable for MVP scale.
- We pay the cost of writing the schema-drift CI check. One-time cost,
  pays for itself the first time it catches a divergence.
- If we later move heavy analytical workloads to the worker, we may
  hit the read-only constraint. Re-evaluate at Phase 3 if that
  happens — easy to relax (give worker write rights to specific tables)
  without rewriting either ORM choice.

## Follow-ups

- Phase-2 task: scaffold `apps/web/prisma/schema.prisma` with the §3.5
  data model from [MVP.md](../../MVP.md).
- Phase-2 task: scaffold `apps/orchestrator/tessar/db/` with mirrored
  SQLAlchemy models + the schema-drift CI script.
- Add Prisma to `apps/web/package.json` (already a `pnpm` workspace).
- Add `sqlalchemy[asyncio]`, `asyncpg`, `pgvector`, `alembic` (used only
  for the drift check, not for migrations) to
  [`apps/orchestrator/pyproject.toml`](../../apps/orchestrator/pyproject.toml).
