# Phase 4 — progress & follow-ups

Source-of-truth tracker for the Phase 4 ("monetize & harden") slices.
Updated as each slice lands. See [IMPLEMENTATION.md](../../IMPLEMENTATION.md) §7
for the gate.

> **Working agreement:** each slice ships behind an ADR when it
> introduces a new external dependency or money-touching surface. Test
> mode only until Phase 6 — never flip to `sk_live_*` inside Phase 4.

## Slice status

| #   | Slice                                | Status  | Tests | Notes                                                                                                                                                                                                                    |
| --- | ------------------------------------ | ------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 4.1 | Stripe Checkout + webhook (test)     | ✅ done | 13    | ADR-0009; `payment_status` enum on `Run`; `createRun` no longer publishes; webhook is source of truth for paid → enqueue; idempotent on `stripeCheckoutSessionId` unique + `run-{id}-checkout-v1` Stripe idempotency key |
| 4.2 | Observability — OTEL traces + Sentry | —       | —     | Pending                                                                                                                                                                                                                  |
| 4.3 | Cloud Armor / WAF baseline           | —       | —     | Pending                                                                                                                                                                                                                  |
| 4.4 | Production env (Terraform)           | —       | —     | Pending                                                                                                                                                                                                                  |
| 4.5 | Restore drill + runbooks             | —       | —     | Pending                                                                                                                                                                                                                  |

Total apps/web vitest as of 4.1: **13/13 passing** (`pnpm --filter @tessar/web test`).
Orchestrator suite unchanged: **168/168 passing**.

## Slice 4.1 — Stripe Checkout (test mode)

Touches:

- `docs/adr/0009-stripe-checkout-test-mode.md`
- `apps/web/prisma/schema.prisma` — adds `enum PaymentStatus` and four
  fields on `Run` (`paymentStatus`, `stripeCheckoutSessionId`, `paidAt`,
  `refundedAt`) + a partial unique on the session id.
- `apps/web/prisma/migrations/20260514120000_payment_status/migration.sql`
- `apps/orchestrator/tessar/db/models.py` — mirror enum + columns +
  index/unique to keep schema-drift check happy.
- `apps/web/lib/stripe.ts` — lazy SDK singleton, helpers for the webhook
  secret and the return base URL.
- `apps/web/lib/runs/create.ts` — drops the Pub/Sub publish; only inserts
  the Run row at `paymentStatus=pending`.
- `apps/web/lib/runs/enqueue.ts` (new) — `enqueueRun()` is the post-paid
  publisher, idempotent against re-delivery.
- `apps/web/app/api/checkout/route.ts` (new) — auth-gated, creates (or
  reuses) the Checkout Session; uses `idempotencyKey: run-{id}-checkout-v1`
  and persists the session id back to the Run row.
- `apps/web/app/api/stripe/webhook/route.ts` (new) — verifies the Stripe
  signature; handles `checkout.session.completed`,
  `checkout.session.async_payment_succeeded`, `checkout.session.expired`,
  `checkout.session.async_payment_failed`, `charge.refunded`. Auth-public
  by design (Stripe carries no Auth.js cookie); authenticity is enforced
  by the signature.
- `apps/web/app/checkout/page.tsx` — wires the real POST → redirect.

Tests live next to the modules:

- `apps/web/lib/runs/enqueue.test.ts` — 5 cases (not_found, not_paid,
  paid+pending publishes once, paid+running is no-op, publish error
  propagates).
- `apps/web/app/api/stripe/webhook/route.test.ts` — 8 cases (missing
  sig, forged sig, completed → marks paid + enqueues, duplicate completed
  is idempotent, completed with `payment_status: unpaid` ignored, expired
  marks failed, refunded marks refunded, unhandled events 200).

Local dev recipe:

```powershell
# Terminal 1
pnpm --filter @tessar/web dev

# Terminal 2 — captures whsec_... and forwards events
stripe listen --forward-to localhost:3000/api/stripe/webhook
# paste the printed whsec_... into apps/web/.env.local as STRIPE_WEBHOOK_SECRET

# Then click through /brief → /checkout → real Stripe Checkout
```

## Pre-Phase-4-close checklist

- [ ] Stripe live-mode keys provisioned (Phase 6 work; do NOT load now)
- [ ] OpenTelemetry exporter to Cloud Trace wired in both services
- [ ] Sentry DSN configured (web + worker)
- [ ] Cloud Armor security policy attached to the global LB
- [ ] Terraform `prod` env applied with min-1 web instance
- [ ] Documented restore-from-backup drill executed once
