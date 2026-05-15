/**
 * Next.js instrumentation hook.
 *
 * Runs once per server process at boot. Loads Sentry's runtime-specific
 * config (Node vs Edge). Both files no-op when SENTRY_DSN is unset.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  } else if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Sentry v10 — surface server-side request errors to Sentry without
// having to wrap every API route. Re-exported as `onRequestError` per
// Next.js's instrumentation hook contract. NO-OP when DSN unset.
export { captureRequestError as onRequestError } from "@sentry/nextjs";
