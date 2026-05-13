-- ADR-0009: Stripe Checkout (test mode) — payment state on Run.
--
-- Adds:
--   - payment_status enum + column (default "pending"),
--   - stripe_checkout_session_id (unique) + paid_at + refunded_at,
--   - index on payment_status,
--   - unique index on stripe_checkout_session_id (so webhook idempotency
--     can use it as a natural key).
--
-- The pre-existing stripe_payment_intent column stays; it's now populated
-- by the webhook from session.payment_intent.

CREATE TYPE "payment_status" AS ENUM ('pending', 'paid', 'failed', 'refunded');

ALTER TABLE "runs"
  ADD COLUMN "payment_status" "payment_status" NOT NULL DEFAULT 'pending',
  ADD COLUMN "stripe_checkout_session_id" TEXT,
  ADD COLUMN "paid_at" TIMESTAMP(3),
  ADD COLUMN "refunded_at" TIMESTAMP(3);

CREATE INDEX "runs_payment_status_idx" ON "runs"("payment_status");
CREATE UNIQUE INDEX "runs_stripe_checkout_session_id_key"
  ON "runs"("stripe_checkout_session_id");
