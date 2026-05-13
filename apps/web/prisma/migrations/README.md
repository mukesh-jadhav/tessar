# Prisma migrations

`prisma migrate dev` writes one folder per migration here, named
`<timestamp>_<slug>/migration.sql`. **Don't hand-edit applied migrations** —
fix forward with a new one.

Conventions for TESSAR (per ADR-0007):

1. **`pgvector` indexes** are not expressible in Prisma's DSL. After running
   `prisma migrate dev --create-only` for any schema change that touches a
   `Unsupported("vector(...)")` column, hand-append the index DDL to the
   generated `migration.sql` **before** applying. Use HNSW where possible:

   ```sql
   CREATE INDEX kb_components_embedding_hnsw_idx
     ON kb_components USING hnsw (embedding vector_cosine_ops);
   ```

2. **Extensions** (`vector`, `pg_trgm`) are declared in
   `datasource.extensions` and Prisma will emit `CREATE EXTENSION IF NOT EXISTS`
   itself. Do not duplicate.

3. **Schema-drift check** (`pnpm db:export-schema` + the orchestrator's drift
   script) introspects the live DB and diffs it against SQLAlchemy metadata.
   If a Prisma migration changes a table the worker reads/writes, regenerate
   the SQLAlchemy mirror in the same PR.

4. **No destructive auto-migrations in CI.** `prisma migrate deploy` only;
   never `migrate dev` against shared envs.
