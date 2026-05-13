/**
 * Stripe SDK singleton.
 *
 * Lazy-initialized so importing this module in tests / build steps
 * does not require ``STRIPE_SECRET_KEY`` to be set. Throws on first
 * actual use if the env var is missing.
 *
 * See ADR-0009 for why we use `stripe@^17` directly with no wrapper.
 */
import "server-only";

import Stripe from "stripe";

let _stripe: Stripe | null = null;

/** Return a memoized Stripe client. Throws if STRIPE_SECRET_KEY is unset. */
export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is unset. Set it in apps/web/.env.local from " +
        "https://dashboard.stripe.com/test/apikeys.",
    );
  }
  _stripe = new Stripe(key, {
    // Pin the API version. Bumping requires re-reading the Stripe changelog.
    apiVersion: "2025-02-24.acacia",
    typescript: true,
    // Cloud Run = short-lived containers; let the SDK reuse sockets.
    maxNetworkRetries: 2,
    appInfo: {
      name: "tessar-web",
      version: "0.0.0",
      url: "https://tessar.dev",
    },
  });
  return _stripe;
}

/** Webhook signing secret. Throws on missing — webhook handler must fail closed. */
export function getStripeWebhookSecret(): string {
  const s = process.env.STRIPE_WEBHOOK_SECRET;
  if (!s) {
    throw new Error(
      "STRIPE_WEBHOOK_SECRET is unset. Local dev: run `stripe listen " +
        "--forward-to localhost:3000/api/stripe/webhook` and paste the " +
        "printed whsec_... into apps/web/.env.local.",
    );
  }
  return s;
}

/** Public base URL Stripe redirects back to. Falls back to AUTH_URL. */
export function getReturnBaseUrl(): string {
  const url = process.env.STRIPE_RETURN_URL ?? process.env.AUTH_URL;
  if (!url) {
    throw new Error("STRIPE_RETURN_URL or AUTH_URL must be set.");
  }
  return url.replace(/\/+$/, "");
}

/** Test seam — drop the cached client (used by unit tests). */
export function __resetStripeForTests(): void {
  _stripe = null;
}
