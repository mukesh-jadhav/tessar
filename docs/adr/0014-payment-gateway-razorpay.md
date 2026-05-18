# ADR-0014: Payment Gateway — Razorpay (supersedes Stripe choice in MVP.md §5 / architecture.instructions.md)

- **Status:** Accepted
- **Date:** 2026-05-18
- **Deciders:** founder
- **Supersedes (in part):** the implicit "Stripe Checkout + Webhooks" decision in [MVP.md](../../MVP.md) §5 and `.github/instructions/architecture.instructions.md` (payments row).

## Context

[MVP.md](../../MVP.md) and `architecture.instructions.md` lock the payment gateway as **Stripe Checkout + Webhooks**. That decision was made before the founding entity / target-market was finalised. We now know:

- **Founding entity:** Indian-registered (confirmed via the operator's prompt that "Stripe is not available in India" — this is technically incorrect as of mid-2026 since Stripe Payments India is live, but the prompt signals an India-resident founder who wants the lowest-friction India-domestic path).
- **First paying users:** assumed India-first (UPI / netbanking / domestic cards) with international cards as a near-term secondary concern. If/when international becomes primary, this ADR's "Future" section spells out the adapter path.
- **Volume at launch:** tens of runs/day at most. Gateway fees are not the bottleneck; onboarding friction and developer-time-to-launch are.

Stripe India works, but Razorpay is the lower-friction India-first path: native UPI deep-link UX, faster KYC, and the entire Indian SaaS ecosystem treats it as the default. The cost of being wrong (switching gateways later) is moderate but bounded, because all payment integration goes through a thin adapter layer (`packages/billing/` to be created).

## Decision

**Adopt Razorpay as the MVP payment gateway.** Specifically:

1. Use **Razorpay Standard Checkout** (hosted checkout, similar shape to Stripe Checkout) for the pay-per-run flow. One checkout session per run.
2. Use **Razorpay Webhooks** for `payment.captured` and `payment.failed` events — signature-verified with `RAZORPAY_WEBHOOK_SECRET`, processed idempotently keyed off `razorpay_payment_id`.
3. Keep the integration behind a thin `BillingProvider` interface in `packages/billing/` (web-only; orchestrator never sees billing). The interface is gateway-agnostic; a future Stripe adapter can be added alongside without touching call sites.
4. **Do not flip Razorpay to live mode** before the existing Phase-6 gate is met (eval bar cleared + soft-launch checklist green). Test-mode keys only until then. This preserves the rule from `implementation-discipline.instructions.md`: "Do not flip Stripe to live mode before Phase 6" — re-read as "do not flip the gateway to live mode before Phase 6".

## Alternatives Considered

- **Stripe (original locked choice).** Best-in-class DX, easiest path to add international card support later, single account can grow into multi-region. Rejected for MVP because Stripe India onboarding has higher friction (more forms, slower KYC for first-time Indian businesses) and UPI UX is less polished than Razorpay's native flow. Re-evaluate at Phase 5 (closed beta) if international demand emerges — adding Stripe alongside Razorpay is a single-adapter change.

- **Both Razorpay (India) + Stripe (international) at launch.** Best end-state but doubles integration surface, doubles webhook plumbing, doubles failure modes. Rejected for MVP — premature. Revisit when international users actually appear.

- **PayU / Cashfree / Instamojo.** Indian alternatives. Razorpay has the largest Indian SaaS footprint, best docs, and best webhook reliability per public reports. Rejected on ecosystem grounds.

- **No payments at MVP launch — free closed beta, monetise later.** Tempting but contradicts core value prop #4 ("Pay-per-outcome — a run produces a tangible artifact") from `product-goals.instructions.md`. Free runs distort feedback (users tolerate quality they wouldn't pay for) and break the per-run gross-margin tracking that Phase 5 requires. Rejected.

## Consequences

### What becomes easier

- India-domestic checkout UX (UPI deep link, netbanking, domestic cards) is best-in-class out of the box.
- Faster onboarding for an India-registered founding entity.
- Razorpay's `payment.captured` webhook semantics map cleanly onto our existing "payment success → publish run to Pub/Sub" flow.

### What becomes harder

- International card support requires Razorpay's International Payments addon (additional onboarding) OR a future Stripe-alongside adapter. Both deferred.
- Subscription/usage-billing primitives are weaker than Stripe's. Not relevant for MVP (pay-per-run is one-shot), would matter if we ever add team plans.
- Less polish in TypeScript SDK + webhook DX. Adapter layer absorbs most of this.

### Follow-up work this ADR implies (NOT done in this ADR; gated on founder action)

1. **Founder external setup** (see [docs/operations/razorpay-setup-checklist.md](../operations/razorpay-setup-checklist.md)):
   - Register Razorpay merchant account against the Indian business entity.
   - Complete KYC (PAN, GST, bank account, business proof).
   - Generate test-mode `Key Id` + `Key Secret`. Store in Secret Manager.
   - Configure a test-mode webhook endpoint pointing at `https://<staging-domain>/api/billing/razorpay/webhook` with a generated `Webhook Secret`.

2. **Code work, when keys are available** (Phase 4 scope):
   - Create `packages/billing/` with a `BillingProvider` interface + `RazorpayBillingProvider` implementation.
   - Add `apps/web/app/api/billing/razorpay/checkout/route.ts` (POST: create checkout session).
   - Add `apps/web/app/api/billing/razorpay/webhook/route.ts` (POST: verify signature, idempotent dispatch, publish to Pub/Sub on `payment.captured`).
   - Update Prisma schema: rename `runs.stripe_payment_intent` → `runs.payment_ref` (gateway-agnostic) + add `runs.payment_gateway` (`'razorpay' | 'stripe'`) for future portability.
   - Zod schemas for Razorpay webhook payloads.
   - Idempotency keyed on `razorpay_payment_id` (not the run id, since one run may have multiple payment attempts).
   - Sentry breadcrumbs for every webhook event; alerts on signature-verification failure or `payment.failed` rate > threshold.

3. **Live-mode promotion gate** (Phase 6 only):
   - Eval harness has cleared the agreed bar.
   - 7 nights of green nightly-eval runs.
   - Webhook replay drill executed in staging.
   - Razorpay account moved to live mode + live keys swapped in Secret Manager.

## Doc updates this ADR triggers (done atomically with this ADR)

- `MVP.md` §3.2 row 12, §5 component table, §5.5 schema field, §5.8 webhook bullet, §5.9 alerting bullet, §6 repo layout (add `packages/billing/`).
- `.github/instructions/architecture.instructions.md` payments row.

## References

- [MVP.md](../../MVP.md) §3.2, §5
- `.github/instructions/architecture.instructions.md`
- `.github/instructions/implementation-discipline.instructions.md` (Phase-4 + Phase-6 gates)
- `.github/instructions/product-goals.instructions.md` (value prop #4: pay-per-outcome)
- [docs/operations/razorpay-setup-checklist.md](../operations/razorpay-setup-checklist.md)
- Razorpay docs: https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/
- Razorpay webhooks: https://razorpay.com/docs/webhooks/
