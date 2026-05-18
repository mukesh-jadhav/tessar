# Razorpay Setup Checklist (founder-only — gated external steps)

This checklist is the prerequisite for any payment integration code work. ADR-0014 adopted Razorpay; this file lists what the founder must do **outside the repo** before Phase-4 payment code can be written. Nothing here can be done by the coding agent.

## Phase 0 — Account creation (do once, before any code)

- [ ] Register a Razorpay merchant account at https://dashboard.razorpay.com/signup against the registered Indian business entity (not a personal account).
- [ ] Complete KYC:
  - [ ] Business PAN
  - [ ] GSTIN (if registered; not all founder entities are at MVP stage)
  - [ ] Cancelled cheque / bank account proof for settlement account
  - [ ] Business proof (Certificate of Incorporation / Partnership Deed / Udyam registration, whichever applies)
  - [ ] Authorised signatory PAN + Aadhaar
- [ ] KYC review typically takes 2–5 business days. Account stays in **test mode** until KYC clears.

## Phase 1 — Test-mode keys (do once, immediately after signup)

Test-mode is usable from the moment the account exists — no KYC needed. All Phase-4 code work happens against test-mode keys.

- [ ] Dashboard → Account & Settings → API Keys → Generate Test Key.
- [ ] Save **Key Id** (starts with `rzp_test_`) and **Key Secret** somewhere temporary (1Password / Bitwarden — NEVER in the repo).
- [ ] After dev environment exists, store both in GCP Secret Manager:
  ```
  gcloud secrets create razorpay-key-id-test --replication-policy=automatic --data-file=-
  gcloud secrets create razorpay-key-secret-test --replication-policy=automatic --data-file=-
  ```
- [ ] Grant the `tessar-web` Cloud Run service account `roles/secretmanager.secretAccessor` on both secrets.

## Phase 2 — Test-mode webhook (after Phase-4 code is deployed to staging)

- [ ] Dashboard → Account & Settings → Webhooks → Add New Webhook.
- [ ] Webhook URL: `https://<staging-domain>/api/billing/razorpay/webhook`
- [ ] Active events (minimal MVP set):
  - [ ] `payment.captured`
  - [ ] `payment.failed`
  - [ ] `payment.authorized` (optional — only if we end up using auth-then-capture)
- [ ] Generate a **Webhook Secret** (Razorpay shows it once — copy immediately). Store in Secret Manager:
  ```
  gcloud secrets create razorpay-webhook-secret-test --replication-policy=automatic --data-file=-
  ```
- [ ] Test the endpoint using Razorpay's "Test Webhook" button. Confirm signature verification passes in staging logs.

## Phase 3 — Live mode promotion (Phase-6 gate only — NOT before)

Per `implementation-discipline.instructions.md` and ADR-0014: live mode is blocked until the Phase-6 launch gate is green.

Promotion gate (all must be true):

- [ ] Eval harness has cleared the agreed bar for 7 consecutive nightly runs.
- [ ] Reliability proof: 10+ consecutive successful end-to-end runs in prod with zero architect failures and zero DLQ entries.
- [ ] Webhook replay drill executed in staging (replay a captured webhook event, confirm idempotency holds — no duplicate run published to Pub/Sub).
- [ ] Cloud SQL restore drill executed (per MVP.md §5.9).
- [ ] Status page live.
- [ ] Founder has set a price (currently TBD per Phase-0 pre-gate in `implementation-discipline.instructions.md`).

When all gates are green:

- [ ] Razorpay Dashboard → toggle account to Live mode (only possible after KYC).
- [ ] Generate **live keys**: `rzp_live_...` Key Id + Key Secret. Store as new Secret Manager secrets:
  ```
  gcloud secrets create razorpay-key-id-live ...
  gcloud secrets create razorpay-key-secret-live ...
  gcloud secrets create razorpay-webhook-secret-live ...
  ```
- [ ] Register a **live-mode webhook** pointing at the production domain.
- [ ] Cutover plan: update Cloud Run env vars to point at `-live` secrets in a single deploy. Smoke-test with a real ₹1 payment to a controlled card before opening to users.

## Out of scope for MVP (do not pursue until backlog)

- International Payments addon (USD/EUR card support).
- Subscription / recurring billing.
- Razorpay Route (split settlements).
- Payment Pages, Payment Links, QR Codes — pay-per-run uses Standard Checkout only.

## References

- [ADR-0014: Payment Gateway — Razorpay](../adr/0014-payment-gateway-razorpay.md)
- Razorpay Standard Checkout: https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/
- Razorpay Webhooks: https://razorpay.com/docs/webhooks/
- Razorpay KYC: https://razorpay.com/docs/payments/dashboard/account-settings/kyc/
