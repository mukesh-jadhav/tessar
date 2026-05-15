/**
 * Sentry edge-runtime init (Next.js middleware + edge routes).
 *
 * Wired via `instrumentation.ts::register`. NO-OP when `SENTRY_DSN` is
 * unset. The edge runtime has a smaller SDK surface — only basic
 * exception capture is supported.
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN?.trim();
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? "dev",
    release: process.env.SENTRY_RELEASE,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0"),
    sendDefaultPii: false,
  });
}
