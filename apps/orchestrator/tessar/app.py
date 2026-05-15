"""TESSAR orchestrator — FastAPI entrypoint.

Two routes for now:

* ``GET  /healthz``       — liveness probe.
* ``POST /pubsub/push``   — Pub/Sub push subscription target. Verifies the
  inbound OIDC token (skipped when ``PUBSUB_EMULATOR_HOST`` is set),
  decodes the message, and dispatches to ``tessar.runner.run``.

Push subscriptions are configured with ``ackDeadline=600`` and the
orchestrator returns 2xx **before** finishing work would lose at-least-
once semantics — so we run the work inline within the 60-min Cloud Run
timeout. Concurrency is pinned to 1 per instance via Cloud Run config.
"""

from __future__ import annotations

import base64
from typing import Any

import structlog
from fastapi import FastAPI, HTTPException, Request, status
from google.auth.transport import requests as ga_requests
from google.oauth2 import id_token
from pydantic import BaseModel, Field

from tessar.config import settings
from tessar.observability import (
    capture_exception,
    get_tracer,
    init_observability,
    instrument_fastapi_app,
)
from tessar.runner import run as run_job

log = structlog.get_logger(__name__)

# Initialise Sentry + OTEL before the FastAPI app is constructed so the
# auto-instrumentation can patch ASGI middleware in the right order.
init_observability("tessar-orchestrator")

app = FastAPI(title="tessar-orchestrator", version="0.1.0")
instrument_fastapi_app(app)


# ─── Health ─────────────────────────────────────────────────────────────────


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


# ─── Pub/Sub push ───────────────────────────────────────────────────────────


class PubSubMessage(BaseModel):
    data: str = Field(default="")
    message_id: str | None = Field(default=None, alias="messageId")
    attributes: dict[str, str] = Field(default_factory=dict)

    model_config = {"populate_by_name": True}


class PubSubEnvelope(BaseModel):
    message: PubSubMessage
    subscription: str | None = None


class RunEnqueued(BaseModel):
    """Mirror of ``apps/web/lib/queue/pubsub.ts::RunEnqueued``."""

    runId: str
    userId: str
    v: int


@app.post("/pubsub/push", status_code=status.HTTP_204_NO_CONTENT)
async def pubsub_push(req: Request) -> None:
    _verify_oidc(req)

    try:
        body: Any = await req.json()
        envelope = PubSubEnvelope.model_validate(body)
    except Exception as exc:  # pragma: no cover — malformed pushes ack-and-drop
        log.warning("pubsub.bad_envelope", error=str(exc))
        # Returning 2xx tells Pub/Sub to ack: poison messages won't loop forever.
        # The DLQ catches genuinely undeliverable ones.
        return

    try:
        raw = base64.b64decode(envelope.message.data) if envelope.message.data else b"{}"
        payload = RunEnqueued.model_validate_json(raw)
    except Exception as exc:
        log.warning("pubsub.bad_payload", error=str(exc), message_id=envelope.message.message_id)
        return

    log.info("run.received", run_id=payload.runId, user_id=payload.userId)
    tracer = get_tracer("tessar.app")
    with tracer.start_as_current_span("tessar.run") as span:
        span.set_attribute("run.id", payload.runId)
        span.set_attribute("run.user_id", payload.userId)
        try:
            await run_job(payload.runId)
        except Exception as exc:
            log.exception("run.failed", run_id=payload.runId, error=str(exc))
            span.record_exception(exc)
            capture_exception(exc, run_id=payload.runId, user_id=payload.userId)
            # 5xx → Pub/Sub redelivers (up to maxDeliveryAttempts → DLQ).
            raise HTTPException(status_code=500, detail="run_failed") from exc


# ─── OIDC verification ──────────────────────────────────────────────────────


def _verify_oidc(req: Request) -> None:
    """Verify the bearer token Pub/Sub attached to the push.

    Skipped when running against the emulator (no token is sent).
    The audience MUST match the Cloud Run service URL — Pub/Sub is
    configured to sign tokens with that as ``aud``.
    """
    if settings.pubsub_emulator_host:
        return

    audience = settings.pubsub_audience
    if not audience:
        # Fail-closed in cloud: refuse to process unsigned pushes if we
        # don't know what audience to expect.
        raise HTTPException(status_code=503, detail="oidc_audience_unconfigured")

    auth_header = req.headers.get("authorization", "")
    if not auth_header.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="missing_bearer")

    token = auth_header.split(" ", 1)[1]
    try:
        id_token.verify_oauth2_token(token, ga_requests.Request(), audience=audience)
    except Exception as exc:
        raise HTTPException(status_code=401, detail="invalid_oidc_token") from exc
