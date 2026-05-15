"""TESSAR orchestrator — observability bootstrap.

Wires Sentry (exception tracking) and OpenTelemetry (distributed
tracing → Google Cloud Trace) for the FastAPI worker. Both layers are
fail-soft: when their respective DSN/project envs are missing the
init becomes a no-op so local dev and CI work unchanged.

Env contract (all optional):

* ``SENTRY_DSN``                — when set, Sentry SDK initialises and
  captures unhandled exceptions + FastAPI request errors. Empty/missing
  ⇒ Sentry disabled.
* ``SENTRY_ENVIRONMENT``        — defaults to ``dev``.
* ``SENTRY_TRACES_SAMPLE_RATE`` — float 0.0–1.0; default ``0.0`` (off).
* ``OTEL_ENABLED``              — ``"true"`` to turn tracing on. Default
  ``false``. The Cloud Trace exporter requires Application Default
  Credentials and ``roles/cloudtrace.agent`` on the Cloud Run SA.
* ``GOOGLE_CLOUD_PROJECT``      — picked up by the Cloud Trace exporter
  to scope spans to the right project.
* ``OTEL_SERVICE_NAME``         — defaults to ``tessar-orchestrator``.

The :func:`init_observability` function is idempotent: subsequent calls
are no-ops. Call it once from ``tessar.app`` before the app starts
serving requests.

Spans:
  * FastAPI auto-instrumentation produces one span per HTTP request.
  * asyncpg auto-instrumentation produces a child span per query.
  * The runner wraps each ``run(run_id)`` invocation in an explicit
    ``tessar.run`` span carrying ``run.id`` as an attribute.
"""

from __future__ import annotations

import os
from typing import Any

import structlog

log = structlog.get_logger(__name__)

_initialised = False
_otel_enabled = False
_sentry_enabled = False


def init_observability(service_name: str = "tessar-orchestrator") -> None:
    """Initialise Sentry + OTEL once. Subsequent calls are no-ops."""
    global _initialised, _otel_enabled, _sentry_enabled
    if _initialised:
        return
    _initialised = True

    _sentry_enabled = _init_sentry(service_name)
    _otel_enabled = _init_otel(service_name)
    log.info(
        "observability.initialised",
        sentry=_sentry_enabled,
        otel=_otel_enabled,
        service=service_name,
    )


def get_tracer(name: str = "tessar.runner") -> Any:
    """Return an OTEL tracer (or a no-op fallback when OTEL is off).

    Callers should treat the return value as opaque and use it only
    via ``with tracer.start_as_current_span(...): ...``.
    """
    if not _otel_enabled:
        return _NoopTracer()
    from opentelemetry import trace  # local import keeps cold-start lean

    return trace.get_tracer(name)


def capture_exception(exc: BaseException, **tags: str) -> None:
    """Send an exception to Sentry if configured. Always safe to call."""
    if not _sentry_enabled:
        return
    try:
        import sentry_sdk

        with sentry_sdk.push_scope() as scope:
            for k, v in tags.items():
                scope.set_tag(k, v)
            sentry_sdk.capture_exception(exc)
    except Exception:  # pragma: no cover — never let observability crash the run
        log.warning("sentry.capture_failed", exc_info=True)


# ─── internals ──────────────────────────────────────────────────────────────


def _init_sentry(service_name: str) -> bool:
    dsn = os.getenv("SENTRY_DSN", "").strip()
    if not dsn:
        return False
    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.starlette import StarletteIntegration

        sentry_sdk.init(
            dsn=dsn,
            environment=os.getenv("SENTRY_ENVIRONMENT", "dev"),
            release=os.getenv("SENTRY_RELEASE") or None,
            traces_sample_rate=float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.0")),
            send_default_pii=False,
            integrations=[
                FastApiIntegration(),
                StarletteIntegration(),
            ],
        )
        sentry_sdk.set_tag("service", service_name)
        return True
    except Exception:  # pragma: no cover — broken DSN must not crash boot
        log.warning("sentry.init_failed", exc_info=True)
        return False


def _init_otel(service_name: str) -> bool:
    if os.getenv("OTEL_ENABLED", "").strip().lower() != "true":
        return False
    try:
        from opentelemetry import trace
        from opentelemetry.exporter.cloud_trace import CloudTraceSpanExporter
        from opentelemetry.instrumentation.asyncpg import AsyncPGInstrumentor
        from opentelemetry.sdk.resources import Resource
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor

        resource = Resource.create(
            {
                "service.name": os.getenv("OTEL_SERVICE_NAME", service_name),
                "service.version": os.getenv("SENTRY_RELEASE", "0.0.0"),
            }
        )
        provider = TracerProvider(resource=resource)
        provider.add_span_processor(BatchSpanProcessor(CloudTraceSpanExporter()))
        trace.set_tracer_provider(provider)

        # Auto-instrument: FastAPI must be patched after the app exists,
        # so we call it from app.py. asyncpg patches the driver itself.
        AsyncPGInstrumentor().instrument()
        return True
    except Exception:  # pragma: no cover — missing creds / pkg should not crash boot
        log.warning("otel.init_failed", exc_info=True)
        return False


def instrument_fastapi_app(app: Any) -> None:
    """Wire OTEL FastAPI middleware. Safe no-op when OTEL is disabled."""
    if not _otel_enabled:
        return
    try:
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

        FastAPIInstrumentor.instrument_app(app)
    except Exception:  # pragma: no cover
        log.warning("otel.fastapi_instrument_failed", exc_info=True)


# ─── no-op fallbacks ────────────────────────────────────────────────────────


class _NoopSpan:
    """Stands in for an OTEL Span when tracing is disabled."""

    def set_attribute(self, *_args: Any, **_kwargs: Any) -> None: ...
    def set_status(self, *_args: Any, **_kwargs: Any) -> None: ...
    def record_exception(self, *_args: Any, **_kwargs: Any) -> None: ...
    def add_event(self, *_args: Any, **_kwargs: Any) -> None: ...

    def __enter__(self) -> _NoopSpan:
        return self

    def __exit__(self, *_args: Any) -> None:
        return None


class _NoopTracer:
    def start_as_current_span(self, *_args: Any, **_kwargs: Any) -> _NoopSpan:
        return _NoopSpan()
