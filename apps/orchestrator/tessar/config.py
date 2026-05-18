"""Orchestrator settings (pydantic-settings).

Loaded once at module import; values come from process env (Cloud Run
injects them from Secret Manager). Locally, ``python-dotenv`` reads
``apps/orchestrator/.env`` via the ``model_config`` below.

Keep this file free of GCP-specific imports — it's used by tests too.
"""

from __future__ import annotations

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Database (SQLAlchemy async DSN; note `+asyncpg`) ────────────────────
    database_url: str = Field(
        default="postgresql+asyncpg://tessar:tessar@localhost:5432/tessar",
        alias="DATABASE_URL",
    )

    # ── Pub/Sub ─────────────────────────────────────────────────────────────
    google_cloud_project: str = Field(default="tessar-local", alias="GOOGLE_CLOUD_PROJECT")
    pubsub_runs_topic: str = Field(default="tessar-runs", alias="PUBSUB_RUNS_TOPIC")
    pubsub_emulator_host: str | None = Field(default=None, alias="PUBSUB_EMULATOR_HOST")

    # ── Cloud Storage ───────────────────────────────────────────────────────
    gcs_bucket: str = Field(default="tessar-artifacts-local", alias="GCS_BUCKET")
    storage_emulator_host: str | None = Field(default=None, alias="STORAGE_EMULATOR_HOST")

    # ── Server ──────────────────────────────────────────────────────────────
    # When unset (local dev with the emulator), OIDC verification on the push
    # endpoint is skipped. In Cloud Run this MUST be the orchestrator's
    # public URL — Pub/Sub signs the token with that as the audience.
    pubsub_audience: str | None = Field(default=None, alias="PUBSUB_AUDIENCE")

    # ── LLM (Phase 3.2/3.3) ─────────────────────────────────────────────────
    # When `vertex_project` is unset, the LLM router falls back to the
    # deterministic MockLlmProvider so dev / CI work without cloud creds.
    vertex_project: str | None = Field(default=None, alias="VERTEX_PROJECT")
    vertex_location: str = Field(default="asia-south1", alias="VERTEX_LOCATION")
    # Claude Sonnet 4.5 is published on Vertex in a different region set
    # than Gemini (us-east5 / europe-west1 / europe-west4 / asia-southeast1
    # — NOT us-central1 / asia-south1). Override the location used by the
    # Anthropic provider here so the rest of Vertex (Gemini, embeddings)
    # can stay regional-cheap while Claude calls go where they're served.
    # See ADR-0015 + run cmpb9cl post-mortem.
    vertex_claude_location: str = Field(default="us-east5", alias="VERTEX_CLAUDE_LOCATION")

    # OpenAI direct API key — last-resort fallback per ADR-0015. Only wired
    # into the router when set (Secret Manager in prod). When unset, the
    # chain ends at Vertex Gemini.
    openai_api_key: str | None = Field(default=None, alias="OPENAI_API_KEY")
    # Optional base_url override for OpenAI-compatible gateways (Azure
    # OpenAI, OpenRouter, etc.). Leave unset for the public OpenAI API.
    openai_base_url: str | None = Field(default=None, alias="OPENAI_BASE_URL")

    # Hard per-run ceilings — router raises BudgetExceeded if breached.
    # Bumped from $0.50 → $0.85 per ADR-0015 (Claude Sonnet 4.5 Tier-A).
    # Derivation: 3 Tier-A calls × ~$0.21/call (30k in + 8k out @ Sonnet 4.5
    # rates) + ~$0.10 Tier-B/C floor + 30% safety margin. Re-tuned in
    # Phase 4 alongside payment-gateway pricing.
    llm_cap_usd_per_run: float = Field(default=0.85, alias="LLM_CAP_USD_PER_RUN")
    llm_cap_tokens_per_run: int = Field(default=400_000, alias="LLM_CAP_TOKENS_PER_RUN")


settings = Settings()
