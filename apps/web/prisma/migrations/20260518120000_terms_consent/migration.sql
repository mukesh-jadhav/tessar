-- ADR-0011: Terms & Privacy consent tracking.
--
-- Adds:
--   - users.latest_terms_version (denormalised pointer for fast lookups)
--   - runs.terms_version_at_run (snapshot of bound contract at payment)
--   - terms_acceptances table (append-only consent log)
--
-- Capture points (see ADR-0011):
--   - context = 'signup'   : Auth.js events.createUser
--   - context = 'checkout' : POST /api/checkout, when paymentStatus flips
--   - context = 'reaccept' : POST /api/legal/accept (re-consent banner)
--
-- Backfill: existing users keep NULL latest_terms_version. They will be
-- prompted by the re-consent banner on next login to accept the current
-- version, which writes a fresh terms_acceptances row.

ALTER TABLE "users"
  ADD COLUMN "latest_terms_version" TEXT;

ALTER TABLE "runs"
  ADD COLUMN "terms_version_at_run" TEXT;

CREATE TABLE "terms_acceptances" (
  "id"              TEXT NOT NULL,
  "user_id"         TEXT NOT NULL,
  "terms_version"   TEXT NOT NULL,
  "privacy_version" TEXT NOT NULL,
  "context"         TEXT NOT NULL,
  "ip_address"      TEXT,
  "user_agent"      TEXT,
  "accepted_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "terms_acceptances_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "terms_acceptances_user_id_accepted_at_idx"
  ON "terms_acceptances"("user_id", "accepted_at" DESC);

ALTER TABLE "terms_acceptances"
  ADD CONSTRAINT "terms_acceptances_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
