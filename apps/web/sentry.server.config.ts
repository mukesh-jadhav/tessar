/**
 * Sentry server-side init (Next.js Node runtime).
 *
 * Wired via `instrumentation.ts::register`. NO-OP when `SENTRY_DSN` is
 * unset so local dev / CI keep working without Sentry credentials.
 *
 * Phase 4.2 (TESSAR observability slice). Turn DSN on by setting
 * `SENTRY_DSN` in Cloud Run env (loaded from Secret Manager).
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN?.trim();
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? "dev",
    release: process.env.SENTRY_RELEASE,
    // Tracing samples — keep 0 unless explicitly enabled. SSE streams
    // would otherwise blow the quota.
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0"),
    sendDefaultPii: false,
    // Don't ship request bodies; brief text is treated as PII per
    // MVP.md §5.8 logging rules.
    beforeSend(event) {
      if (event.request) {
        delete event.request.data;
        delete event.request.cookies;
      }
      return event;
    },
  });
}
