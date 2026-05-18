# ADR-0011 — Terms & Privacy consent tracking

**Status:** Accepted
**Date:** 2026-05-18

## Context

We charge per run, ship a legally-defensible Terms of Service that caps
liability at the run fee, and process customer briefs that may contain
sensitive business detail. Two pressures converge:

1. **Defensibility.** When (not if) a customer disputes a charge or a
   regulator asks for our DPA, we need to produce an exact record of
   which version of the Terms / Privacy Policy was in effect at the
   moment the customer agreed, plus rough provenance (IP / UA / when).
2. **Conversion.** Pre-launch user research (`docs/research/phase1-feedback.md`)
   shows the legal layer is the single biggest friction point in the
   checkout flow. A blocking modal at first sign-in or a thick consent
   page on every payment will visibly hurt our paid-conversion rate.

We need consent capture that is **auditable** without being **frightening**.

## Decision

### Capture model

Consent is captured at three click-wrap moments:

| Context    | Trigger                                                                                                                      | Storage                                                                     |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `signup`   | `Auth.js events.createUser` (fires once when a new user row is inserted, post magic-link verification or first Google OAuth) | `TermsAcceptance` row + `User.latestTermsVersion`                           |
| `checkout` | First `POST /api/checkout` for a Run (acceptance line shown directly above the "Continue to payment" button)                 | `TermsAcceptance` row + `Run.termsVersionAtRun` + `User.latestTermsVersion` |
| `reaccept` | `POST /api/legal/accept` (called by the in-app `<TermsConsentBanner>` when versions drift)                                   | `TermsAcceptance` row + `User.latestTermsVersion`                           |

The visible UI is intentionally light:

- `/signin` already shows: _"By signing in you agree to our Terms and Privacy Policy."_
- `/checkout` adds: _"By starting this run you agree to our Terms and acknowledge that recommendations are AI-generated research and require professional review before production use."_
- `<TermsConsentBanner>` is a slim non-blocking banner — never a modal.

We avoid blocking modals because they convert worse and signal anxiety.
The legal substance is identical to a modal-gated flow; only the
presentation differs.

### Version identifiers

`TERMS_VERSION` and `PRIVACY_VERSION` are string constants in
`lib/legal.ts`. They are bumped **only** when the substance of the
documents changes (new clause, new sub-processor, new data use,
changed liability cap). Typo fixes don't bump the version — we want
re-consent friction to track real changes, not editorial churn.

The version string is the contract identifier. The Markdown body in
`TERMS_SECTIONS` / `PRIVACY_SECTIONS` is a _display_ of that version
and may be regenerated freely as long as substance is unchanged.

### Schema

```prisma
model TermsAcceptance {
  id              String   @id @default(cuid())
  userId          String   @map("user_id")
  termsVersion    String   @map("terms_version")
  privacyVersion  String   @map("privacy_version")
  context         String   // "signup" | "checkout" | "reaccept"
  ipAddress       String?  @map("ip_address")
  userAgent       String?  @map("user_agent")
  acceptedAt      DateTime @default(now()) @map("accepted_at")
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId, acceptedAt(sort: Desc)])
  @@map("terms_acceptances")
}
```

Plus two denormalised pointers:

- `User.latestTermsVersion` — hot-path check for "does this user need
  to re-consent?". Updated in the same transaction as every insert.
- `Run.termsVersionAtRun` — the binding contract version at the moment
  payment was authorised. Frozen for the life of the run.

`context` is a free-form string rather than an enum so we can add new
capture points (e.g. `api-key-generation`) without a migration.

`ipAddress` and `userAgent` are nullable. They're populated when a
request handler has the headers (checkout, reaccept) and NULL when
captured from an Auth.js event (signup) — the existence of the row
plus the version string is what the audit relies on; IP/UA are
corroborating evidence, not the legal anchor.

### Where the receipt lives

`/account` shows the user their most recent acceptance ("You agreed
to Terms v2026-05-18 on May 18, 2026 from 203.0.113.4") plus an
expandable full history. This is the page we point at when
enterprise procurement asks for evidence.

### Re-consent flow

When we publish a new version, we bump the constants. On next page
load the `<TermsConsentBanner>` mounted in `<AppShell>` notices the
version drift (via `GET /api/legal/me`) and shows a slim sticky banner
under the header. The banner is non-blocking — the app continues to
function — until the user clicks "Accept updated terms", which POSTs
to `/api/legal/accept`. As a backstop, the next paid run will also
re-stamp consent via the checkout capture path.

## Consequences

**Positive**

- Full audit trail with three capture points and per-row provenance.
- No blocking modals; conversion impact minimised.
- Versions are explicit and stable identifiers.
- Per-Run version stamp protects us if a customer disputes terms that
  changed mid-flight.

**Negative**

- Three capture points means three code paths to keep in sync. The
  `recordConsent()` helper centralises the write to mitigate this.
- IP/UA missing from `signup` rows. Acceptable: the signup row's
  legal weight comes from the version string + the `createUser` event
  itself, which requires verified email ownership.

**Risks**

- If the `TERMS_VERSION` constant is bumped without legal review,
  every user is re-prompted. Mitigation: bump is a code change → goes
  through PR review.
- If `recordConsent()` throws inside the checkout handler, payment
  still proceeds (we wrap in try/catch). The `Run.termsVersionAtRun`
  stamp is the legal anchor in that case; we'll backfill the
  `TermsAcceptance` row via a reconciliation job if needed.

## Out of scope

- Per-region Terms variants (EU vs US). Single Terms at MVP.
- Granular consent (cookies, analytics, marketing). Single all-or-
  nothing acceptance at MVP, in line with B2B SaaS norms.
- Public Terms changelog. The `LEGAL_LAST_UPDATED` date and the version
  string in the receipt are the user-facing changelog at MVP.
