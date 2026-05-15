/**
 * Sentry browser init (Next.js client).
 *
 * Loaded by the framework as `instrumentation-client.ts` (Sentry v10
 * convention). NO-OP unless `NEXT_PUBLIC_SENTRY_DSN` is set at build
 * time — `SENTRY_DSN` is server-only and intentionally not exposed to
 * the browser bundle.
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? "dev",
    release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
    tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? "0"),
    // Replays are a paid Sentry feature; off by default.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    sendDefaultPii: false,
  });
}
