/**
 * Exports the Prisma schema (post-format) to a stable on-disk JSON-ish
 * artifact that the orchestrator's schema-drift check can read.
 *
 * For now this just runs `prisma format` and copies the canonical schema
 * file to a path the worker can pick up. The richer DMMF-based diff lands
 * once Cloud SQL is up and we can `prisma db pull` against it.
 */
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { execSync } from "node:child_process";

const REPO_ROOT = resolve(__dirname, "..", "..", "..");
const SCHEMA_SRC = resolve(__dirname, "..", "prisma", "schema.prisma");
const SCHEMA_OUT = resolve(
  REPO_ROOT,
  "packages",
  "shared-schemas",
  "prisma-schema.snapshot.prisma",
);

execSync("pnpm prisma format", { stdio: "inherit" });

mkdirSync(dirname(SCHEMA_OUT), { recursive: true });
copyFileSync(SCHEMA_SRC, SCHEMA_OUT);

// eslint-disable-next-line no-console
console.log(`[db:export-schema] copied ${SCHEMA_SRC} → ${SCHEMA_OUT}`);
