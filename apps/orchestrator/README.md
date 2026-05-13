# tessar-orchestrator

Python 3.12 + LangGraph + Pydantic worker. Cloud Run service that consumes Pub/Sub push messages and runs the agent graph.

See [.github/instructions/architecture.instructions.md](../../.github/instructions/architecture.instructions.md).

## First-time setup

```bash
# install uv: https://docs.astral.sh/uv/
uv sync
uv run pytest
```

## Phase-2 plumbing — running locally

```powershell
# 1. Bring up emulators (Postgres, Redis, fake-gcs, Pub/Sub, Mailpit)
docker compose -f infra/docker-compose.yml up -d

# 2. Apply Prisma schema (from apps/web)
pnpm --filter @tessar/web prisma:migrate:dev

# 3. Initialise the Pub/Sub topic + subscription + GCS bucket
$env:PUBSUB_EMULATOR_HOST = "localhost:8085"
$env:STORAGE_EMULATOR_HOST = "http://localhost:4443"
$env:GOOGLE_CLOUD_PROJECT = "tessar-local"
uv run python scripts/init_local_emulators.py

# 4. Start the orchestrator (port 8000 — matches the push endpoint baked into init)
uv run uvicorn tessar.app:app --host 0.0.0.0 --port 8000 --reload

# 5. In another terminal, start the web app
pnpm --filter @tessar/web dev
```

Submitting a brief from `/brief` should now persist a `Run` row, publish to Pub/Sub, and the orchestrator should emit ~9 `RunEvent` rows + a stub markdown artifact in the `tessar-artifacts-local` bucket.

## Layout (added through Phases 2–3)

- `tessar/agents/` — one module per agent in the graph
- `tessar/kb/` — knowledge-base loaders & retrieval
- `tessar/llm/` — provider-agnostic LLM router (Vertex Gemini → Claude-on-Vertex → OpenAI)
- `tessar/pricing/` — cost-estimator adapters
- `tessar/diagrams/` — Mermaid generation + mmdc rendering
- `tessar/packager/` — MD assembly + WeasyPrint PDF
- `tessar/graph.py` — LangGraph wiring
