# syntax=docker/dockerfile:1.7-labs
#
# apps/orchestrator — FastAPI + LangGraph worker for Cloud Run.
#
# Build context = apps/orchestrator/ (note: NOT the repo root — see
# main.yml deploy job). uv handles the install; the runtime image keeps
# only the wheels + the package.
#
# WeasyPrint pulls in cairo / pango / gdk-pixbuf at runtime, so the
# runner has those system libs even after we discard the build chain.

ARG PYTHON_VERSION=3.12-slim-bookworm

# ─── Stage 1: builder ──────────────────────────────────────────────────────
FROM python:${PYTHON_VERSION} AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never

# Build deps for wheels that don't ship binaries for Linux ARM/AMD slim.
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        curl \
        ca-certificates \
        libffi-dev \
        libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install uv (lightweight; pinned to a known-good).
COPY --from=ghcr.io/astral-sh/uv:0.5.6 /uv /uvx /usr/local/bin/

WORKDIR /app

# Resolve and install into a project-local .venv so we can copy it
# wholesale into the runner stage.
COPY pyproject.toml README.md ./
# uv.lock is optional today; copy if present (won't fail if missing
# thanks to the * pattern).
COPY uv.loc[k] ./
COPY tessar ./tessar

RUN uv sync --no-dev --frozen 2>/dev/null \
 || uv sync --no-dev

# ─── Stage 2: runner ───────────────────────────────────────────────────────
FROM python:${PYTHON_VERSION} AS runner

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:$PATH" \
    PORT=8080 \
    HOST=0.0.0.0

# Runtime libs:
#   - WeasyPrint: cairo, pango, gdk-pixbuf, harfbuzz, fonts
#   - psycopg/asyncpg + Cloud SQL connector use libpq
#   - playwright (post-MVP) NOT installed here on purpose
RUN apt-get update && apt-get install -y --no-install-recommends \
        libcairo2 \
        libpango-1.0-0 \
        libpangocairo-1.0-0 \
        libgdk-pixbuf-2.0-0 \
        libharfbuzz0b \
        libffi8 \
        libpq5 \
        fonts-liberation \
        fonts-noto-color-emoji \
        ca-certificates \
        tini \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Non-root for Cloud Run hardening.
RUN groupadd --system --gid 1001 worker \
 && useradd  --system --uid 1001 --gid worker worker

COPY --from=builder --chown=worker:worker /app/.venv ./.venv
COPY --chown=worker:worker tessar ./tessar
COPY --chown=worker:worker pyproject.toml README.md ./

USER worker
EXPOSE 8080

# tini reaps zombies left behind by Playwright/WeasyPrint subprocs (cheap insurance).
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["uvicorn", "tessar.app:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1"]
