# syntax=docker/dockerfile:1.7-labs
#
# apps/web — Next.js 15 + Prisma image for Cloud Run.
#
# Build context MUST be the repo root (not apps/web/) so we can copy the
# pnpm workspace lockfile and any shared packages. The CI workflow does
# this already (`docker build -f apps/web/Dockerfile .`).
#
# Three-stage build:
#   1. deps    — pnpm install with the lockfile (cached on lockfile hash)
#   2. builder — `pnpm --filter @tessar/web build` produces a standalone tree
#   3. runner  — distroless-style minimal node image; only the standalone
#                output + Prisma engines + static assets are copied in.

# ─── Stage 1: deps ─────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS deps

ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=1
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

WORKDIR /repo

# Copy only the manifests + lockfile so this layer caches well.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages packages

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @tessar/web... --prod=false

# ─── Stage 2: builder ──────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS builder

ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=1 \
    NEXT_TELEMETRY_DISABLED=1 \
    NEXT_OUTPUT=standalone
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

WORKDIR /repo

COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/apps/web/node_modules ./apps/web/node_modules
COPY . .

# Generate the Prisma client against the bundled schema. The query
# engine binary lands in node_modules and gets carried into runtime
# below.
RUN pnpm --filter @tessar/web prisma:generate

# Next build (output=standalone via NEXT_OUTPUT env above).
RUN pnpm --filter @tessar/web build

# ─── Stage 3: runner ───────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runner

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=8080 \
    HOSTNAME=0.0.0.0
WORKDIR /app

# Non-root for Cloud Run hardening.
RUN groupadd --system --gid 1001 nodejs \
 && useradd  --system --uid 1001 --gid nodejs nextjs

# Standalone server bundle (includes pruned node_modules).
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/.next/standalone ./
# Static + public assets (Next won't serve these from standalone otherwise).
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/public ./apps/web/public
# Prisma needs the schema + generated client at runtime.
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/prisma ./apps/web/prisma

USER nextjs
EXPOSE 8080

# The standalone output places its server.js at the workspace path.
CMD ["node", "apps/web/server.js"]

# ─── Stage 4: migrate ──────────────────────────────────────────────────────
# One-shot image used by a Cloud Run Job to apply Prisma migrations against
# the dev/prod database. Built with `--target migrate` and run with
# `gcloud run jobs execute`. Reuses the deps stage so the prisma CLI and
# the generated query engine binary are both already present.
FROM node:22-bookworm-slim AS migrate

ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:/repo/node_modules/.bin:$PATH \
    NODE_ENV=production \
    CI=1
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

WORKDIR /repo

# Bring in the installed node_modules (incl. prisma CLI) + workspace
# manifests so pnpm/prisma resolve correctly.
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/apps/web/node_modules ./apps/web/node_modules
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/web/package.json ./apps/web/package.json
# Generated client (libquery_engine for debian-openssl-3.0.x).
COPY --from=builder /repo/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /repo/apps/web/node_modules/.prisma ./apps/web/node_modules/.prisma
# Schema + migrations.
COPY apps/web/prisma ./apps/web/prisma

# `prisma migrate deploy` exits non-zero on any failure → Cloud Run Job
# execution will fail and CI will stop the deploy.
CMD ["pnpm", "--filter", "@tessar/web", "exec", "prisma", "migrate", "deploy"]
