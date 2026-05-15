# ADR-0010: Observability — Sentry + OTEL → Cloud Trace

- **Status:** Accepted
- **Date:** 2025-11-19
- **Deciders:** mjadh

## Context

Phase 4.2 of [IMPLEMENTATION.md](../../IMPLEMENTATION.md) calls for production
observability before public launch. The last two debug cycles (cost_estimator
enum bug; PDF generation failures) required grepping Cloud Run text logs to
correlate worker exceptions with run IDs. That doesn't scale to paying users.

Two distinct needs:

1. **Exception tracking** — alert + symbolicate user-affecting errors with
   stack trace, breadcrumbs, and per-run context.
2. **Distributed tracing** — see a single run as one timeline spanning
   `tessar-web → Pub/Sub → tessar-orchestrator → Vertex AI / Postgres / GCS`,
   with per-agent timing.

OpenTelemetry already standardised tracing; Cloud Trace is the GCP-native
backend (free up to generous limits, no extra vendor). Sentry is the de-facto
standard for exception tracking and has a generous free tier (5k errors/mo).
Both have first-class SDKs for FastAPI and Next.js.

## Decision

Adopt **Sentry** for exception tracking on both `tessar-web` and
`tessar-orchestrator`, and **OpenTelemetry → Cloud Trace** for distributed
tracing on the orchestrator.

Implementation:

- Worker: a single `tessar/observability.py` bootstrap module is called
  before FastAPI construction. It conditionally enables Sentry (via DSN env)
  and OTEL (via `OTEL_ENABLED=true`). FastAPI + asyncpg are auto-instrumented;
  `pubsub_push` opens an explicit `tessar.run` span tagged with `run.id` and
  `run.user_id`. Run failures `record_exception` on the span and
  `capture_exception` to Sentry with the same tags.
- Web: Sentry's standard Next.js v10 wiring — `instrumentation.ts`,
  `instrumentation-client.ts`, `sentry.server.config.ts`,
  `sentry.edge.config.ts`. `next.config.ts` is wrapped with
  `withSentryConfig` only when `SENTRY_DSN` is set, so local dev and CI
  without Sentry creds remain green.

Env contract — **all optional**, missing = silent no-op:

| Var                         | Used by    | Notes                                     |
| --------------------------- | ---------- | ----------------------------------------- |
| `SENTRY_DSN`                | both       | Empty disables Sentry.                    |
| `NEXT_PUBLIC_SENTRY_DSN`    | web client | Same DSN, exposed to browser.             |
| `SENTRY_ENVIRONMENT`        | both       | `dev`, `staging`, `prod`. Defaults `dev`. |
| `SENTRY_RELEASE`            | both       | Set to image tag in CI.                   |
| `SENTRY_TRACES_SAMPLE_RATE` | both       | Defaults `0` (errors-only).               |
| `OTEL_ENABLED`              | worker     | `true` to export spans to Cloud Trace.    |
| `OTEL_SERVICE_NAME`         | worker     | Defaults `tessar-orchestrator`.           |
| `GOOGLE_CLOUD_PROJECT`      | worker     | Required for Cloud Trace exporter.        |

PII discipline (per [MVP.md](../../MVP.md) §5.8): `sendDefaultPii: false` on
all Sentry inits; `beforeSend` hook strips `request.data` and
`request.cookies` from web events. Worker exceptions are tagged with
`run_id` / `user_id` only — never the brief contents.

GCP IAM: both runtime SAs receive `roles/cloudtrace.agent` (added in
[infra/terraform/modules/compute/main.tf](../../infra/terraform/modules/compute/main.tf)).
`cloudtrace.googleapis.com` must be enabled on the project (assumed
pre-enabled along with the other core APIs).

Sentry DSN secrets are provisioned out-of-band before first deploy:

```pwsh
# UTF-8 no BOM is required — see /memories/repo/tessar.md item #75.
$dsn = "<copied from sentry.io>"
$tmp = New-TemporaryFile
[System.IO.File]::WriteAllText($tmp, $dsn, [System.IO.Encoding]::UTF8)
gcloud secrets create sentry-dsn-web --project tessar-dev `
  --replication-policy=automatic --data-file=$tmp
Remove-Item $tmp
# Repeat for sentry-dsn-worker.
```

The CI deploy job already exports `SENTRY_ENVIRONMENT` and `SENTRY_RELEASE`;
the `--update-secrets` line for `SENTRY_DSN` is committed but commented and
will be enabled in a follow-up PR once the secrets exist.

## Alternatives Considered

- **Sentry only, no OTEL.** Sentry's own performance tracing covers single-process
  traces but is awkward across the Pub/Sub boundary and adds material cost at
  paid tiers. OTEL → Cloud Trace is free and propagates cleanly via standard
  `traceparent` headers.
- **OTEL only, no Sentry.** Cloud Error Reporting can ingest exceptions from
  Cloud Logging, but lacks the alerting, breadcrumbs, release-tracking, and
  per-user attribution that Sentry gives out of the box. Adding it is a half
  day; replacing it later is also a half day.
- **Datadog / Honeycomb / New Relic.** All competent. Rejected on cost vs.
  current scale. Sentry free tier + Cloud Trace free tier covers MVP usage
  with zero monthly bill.
- **Wrap Next.js with `@vercel/otel` and ship to Cloud Trace too.** Considered
  but deferred. The web side does relatively little CPU work; the orchestrator
  is where per-agent timing matters. Revisit when web latency becomes the
  question.

## Consequences

What becomes easier:

- Run failures surface in Sentry with the run id and user id pre-tagged, no
  log grep required.
- Per-run timelines in Cloud Trace make it obvious which agent is slow.
- The same Sentry release tag (= image SHA tag) ties an error back to a
  specific deploy.

What becomes harder / follow-ups:

- Two more SDKs to keep updated. Both are added to the standard lockfile
  upgrade rotation.
- Per-agent OTEL spans inside `runner.run()` are **not** opened in this slice
  (would require re-indenting the 870-line state machine). Tracked as a
  follow-up; the run-level span is sufficient to start.
- Source-map upload via the Sentry webpack plugin is gated on a future
  `SENTRY_AUTH_TOKEN` — added to the build options but disabled by default so
  PR builds without the token still succeed.

## References

- [IMPLEMENTATION.md](../../IMPLEMENTATION.md) §6 (Phase 4 — Monetize & harden)
- [MVP.md](../../MVP.md) §5.8 (security baseline, PII discipline)
- [docs/operations/phase4-progress.md](../operations/phase4-progress.md) slice 4.2
- [Sentry Next.js v10 docs](https://docs.sentry.io/platforms/javascript/guides/nextjs/)
- [opentelemetry-exporter-gcp-trace](https://pypi.org/project/opentelemetry-exporter-gcp-trace/)
