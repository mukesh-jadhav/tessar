# ADR-0009: Stripe Checkout in test mode for Phase 4

- **Status:** Accepted
- **Date:** 2026-05-14
- **Deciders:** TESSAR core (autonomous Phase 4.1 slice)

## Context

Phase 4 ("Monetize & harden") gates the public launch on a working,
paid run flow. Per [MVP.md](../../MVP.md) §4.4 and
[IMPLEMENTATION.md](../../IMPLEMENTATION.md) §7.1, billing must be
**Stripe Checkout + signature-verified webhooks with idempotency keys**.
Pricing is locked at `$10/run` (single tier; see
`apps/web/lib/pricing.ts`).

Until now (Phase 2), `POST /api/runs` created a `Run` row and
immediately published `RunEnqueued` to Pub/Sub. That is wrong for a paid
product: the worker would burn LLM budget before the user paid. We need
a **paywall between brief submission and worker dispatch**.

We also need a payment data model that survives Stripe's eventual-consistency:
a checkout session can resolve to `paid` immediately, asynchronously
(`checkout.session.async_payment_succeeded`), or fail after the user
already left the success page.

This slice ships **test mode only**. Phase 6 flips Stripe to live mode
(see [IMPLEMENTATION.md](../../IMPLEMENTATION.md) §9 "Public Launch").

## Decision

1. **Add the `stripe` Node SDK to `apps/web`** (`stripe@^17.4`). It is
   the only first-party SDK; no third-party wrappers.
2. **Persist payment state on `Run`**, not on a separate `Payment` table:
   - new enum `PaymentStatus { pending, paid, failed, refunded }`
   - new fields `paymentStatus`, `stripeCheckoutSessionId`, `paidAt`,
     `refundedAt`
   - the existing `stripePaymentIntent` column (added in Phase 2 as a
     placeholder) is now populated by the webhook.
   - one Run = at most one Checkout Session at MVP. Re-checkout requires
     a new Run row (simpler than session reuse + safer for refunds).
3. **Split `createRun` into two phases.** `createRun` only inserts the
   Run row (status=`pending`, paymentStatus=`pending`); a new
   `enqueueRun` (called from the webhook handler) publishes
   `RunEnqueued` and is idempotent on `runId`.
4. **`POST /api/checkout`** creates a Stripe Checkout Session bound to
   the Run row using `client_reference_id=runId` and `metadata={runId,
userId}`. We use Stripe's `idempotencyKey` of
   `run-{runId}-checkout-v1` so retries by the browser cannot create
   duplicate sessions. Line item is `price_data` (USD, `unit_amount =
priceCents`) — no Stripe Product/Price object to manage at MVP.
5. **`POST /api/stripe/webhook`** verifies the signature with
   `STRIPE_WEBHOOK_SECRET`, parses the raw body, and handles four event
   types:
   - `checkout.session.completed` (sync card success)
   - `checkout.session.async_payment_succeeded` (delayed methods, e.g.
     SEPA, ACH)
   - `checkout.session.expired` → `paymentStatus=failed`
   - `checkout.session.async_payment_failed` → `paymentStatus=failed`
     On success it transitions `Run.paymentStatus` to `paid`, stores the
     PaymentIntent id, and calls `enqueueRun(runId)`. The handler is
     **idempotent** — if `paymentStatus` is already `paid` it returns 200
     without re-publishing (Stripe replays webhooks freely; we cannot trust
     single-delivery).
6. **The webhook is the source of truth, not the success URL.** The
   browser-facing `?success=1` redirect just tells the user "payment
   accepted, watch your run start"; the actual enqueue happens inside
   the webhook even if the user closes the tab.
7. **No refund automation in this slice.** A `POST /api/stripe/webhook`
   handler stub recognises `charge.refunded` and writes `paymentStatus=
refunded`, but the manual refund tool ships in Phase 4.7 ("runbooks").
8. **Webhook route is auth-public** (not under any
   `PROTECTED_PREFIXES`). Authentication is the signature.
9. **`STRIPE_WEBHOOK_SECRET` is per-environment** (Stripe issues a
   different one for the local CLI vs prod). Local dev uses `stripe
listen --forward-to localhost:3000/api/stripe/webhook`; the secret it
   prints goes into `apps/web/.env.local`.

## Alternatives Considered

- **Stripe Payment Links** (no API call, just a hardcoded URL). Rejected:
  cannot bind a payment to a specific Run row reliably; cannot pass
  `client_reference_id`; cannot vary amount per-customer if we ever
  introduce coupons/credits in Phase 5.
- **Stripe Billing (subscriptions)**. Out of scope: pricing is
  pay-per-run, not recurring. Roadmap item only (already noted in
  `apps/web/app/decide/page.tsx`).
- **Lemon Squeezy / Paddle** (merchant-of-record). Better tax handling
  but worse webhook ergonomics, no Cloud Run-friendly Node SDKs at the
  same level of polish, and harder to audit. Phase 6 may revisit if we
  hit EU-VAT pain.
- **Pre-pay credits (top up wallet, decrement on run)**. Adds a whole
  ledger system. Rejected for MVP.
- **Charge after the run completes** (estimate-then-bill). Worse fraud
  exposure (we burn LLM money before knowing if the card is good); UX
  worse (user has no commitment moment). Refund-on-failure handled in
  Phase 4 backlog instead.
- **A separate `Payment` table.** Cleaner long-term but at MVP it's a
  1:1 with Run, so an extra table is pure overhead and a JOIN on every
  status check.

## Consequences

**Easier:**

- The Pub/Sub publish is now gated. The worker can never burn LLM
  budget on an unpaid run.
- Refunds (Phase 4.7) only need to set `paymentStatus=refunded` and call
  `prisma.run.update` — no rollback of run state needed.
- Webhook idempotency is a one-line guard.

**Harder:**

- The browser flow is now async. The /checkout page redirects to Stripe;
  Stripe redirects back to `/run/{id}?success=1`; the run might still
  show `pending_payment` for ~250ms until the webhook lands. The /run
  page must show a "waiting for payment confirmation" state for that
  window, and the SSE stream must not 404 if the worker hasn't picked it
  up yet.
- Local dev requires `stripe listen` running, otherwise the webhook
  never fires and runs sit at `pending_payment` forever. Documented in
  `docs/operations/phase4-prereqs.md`.

**Follow-up:**

- Refund flow + reconciliation runbook (Phase 4.7).
- Coupon support for closed-beta users (Phase 5) — Stripe `discounts`
  on the Checkout Session.
- Live-mode flip + production webhook endpoint registration in the
  Stripe dashboard (Phase 6 launch checklist).
- Tax handling: Stripe Tax is enabled per-account, no code change
  required, but needs a Stripe dashboard toggle + ToS review (Phase 6).

## References

- [MVP.md](../../MVP.md) §4.4 (billing requirements), §5.8 (webhook
  signature verification + idempotency keys).
- [IMPLEMENTATION.md](../../IMPLEMENTATION.md) §7 (Phase 4 tasks + DoD).
- [`apps/web/lib/pricing.ts`](../../apps/web/lib/pricing.ts) (single
  source for `$10/run`).
- ADR-0007 (ORM split: Prisma owns canonical schema, SQLAlchemy mirrors
  read-only).
