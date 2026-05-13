/**
 * Pricing — single source of truth for the price-per-run.
 *
 * Lock: $10/run at MVP launch (set 2026-05-11). Changing this value flows
 * through every public surface (landing, brief, checkout, billing, sign-in
 * trust bar) so the user never sees a stale figure.
 *
 * Margin guardrail (see ADR-0005): at $10/run we're targeting ≥ $5/run
 * gross margin after Stripe fees + LLM + infra. If LLM cost-per-run
 * trends above $3 in Phase-3 evals, we revisit pricing or model tier.
 */

export const PRICE_PER_RUN_USD = 10;

/** Display string, e.g. `"$10"` (no decimal for whole dollars). */
export const PRICE_PER_RUN_LABEL = `$${PRICE_PER_RUN_USD}`;

/** Always two-decimal form, e.g. `"$10.00"` — for invoice-style rows. */
export const PRICE_PER_RUN_LABEL_2DP = `$${PRICE_PER_RUN_USD.toFixed(2)}`;
