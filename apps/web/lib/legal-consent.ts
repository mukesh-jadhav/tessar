/**
 * lib/legal-consent.ts — consent capture + lookup helpers.
 *
 * Single place that knows how to write a `TermsAcceptance` row and bump
 * the denormalised `User.latestTermsVersion` pointer. Call from:
 *
 *   - Auth.js events.createUser  → recordConsent(..., "signup")
 *   - POST /api/checkout         → recordConsent(..., "checkout") + stamp Run
 *   - POST /api/legal/accept     → recordConsent(..., "reaccept")
 *
 * IP + UA capture lives here so callers don't have to remember to pass
 * them through; we accept a NextRequest-shaped `Headers` and extract the
 * standard headers (`x-forwarded-for`, `user-agent`). If the caller
 * doesn't have a request (e.g. Auth.js events), pass `null`.
 *
 * See ADR-0011 for the capture strategy and trade-offs.
 */
import { prisma } from "@/lib/db";
import { TERMS_VERSION, PRIVACY_VERSION } from "@/lib/legal";

export type ConsentContext = "signup" | "checkout" | "reaccept";

interface RecordOptions {
  userId: string;
  context: ConsentContext;
  /** Optional pre-extracted IP/UA; if omitted, callers can pass `headers`. */
  ip?: string | null;
  userAgent?: string | null;
  headers?: Headers | null;
  /** Override versions for tests / backfill. Defaults to current constants. */
  termsVersion?: string;
  privacyVersion?: string;
}

/**
 * Insert a TermsAcceptance row and update User.latestTermsVersion in a
 * single transaction so the denormalised pointer can never lag the log.
 */
export async function recordConsent(opts: RecordOptions): Promise<void> {
  const tv = opts.termsVersion ?? TERMS_VERSION;
  const pv = opts.privacyVersion ?? PRIVACY_VERSION;
  const ip = opts.ip ?? extractIp(opts.headers ?? null);
  const ua = opts.userAgent ?? extractUserAgent(opts.headers ?? null);

  await prisma.$transaction([
    prisma.termsAcceptance.create({
      data: {
        userId: opts.userId,
        termsVersion: tv,
        privacyVersion: pv,
        context: opts.context,
        ipAddress: ip,
        userAgent: ua,
      },
    }),
    prisma.user.update({
      where: { id: opts.userId },
      data: { latestTermsVersion: tv },
    }),
  ]);
}

/**
 * "Does this user need to see the re-consent banner?" — cheap check
 * against the denormalised User.latestTermsVersion. Returns true when
 * the user has never consented OR their last consent is older than the
 * current published version.
 */
export function needsReconsent(latestTermsVersion: string | null | undefined): boolean {
  if (!latestTermsVersion) return true;
  return latestTermsVersion !== TERMS_VERSION;
}

/** Returns the most recent acceptance for receipt display in /account. */
export async function getLatestAcceptance(userId: string): Promise<{
  termsVersion: string;
  privacyVersion: string;
  context: string;
  acceptedAt: Date;
  ipAddress: string | null;
} | null> {
  const row = await prisma.termsAcceptance.findFirst({
    where: { userId },
    orderBy: { acceptedAt: "desc" },
    select: {
      termsVersion: true,
      privacyVersion: true,
      context: true,
      acceptedAt: true,
      ipAddress: true,
    },
  });
  return row;
}

function extractIp(headers: Headers | null): string | null {
  if (!headers) return null;
  // Cloud Run sits behind the global LB which sets X-Forwarded-For with
  // the original client first. Locally Next.js doesn't populate it, so
  // fall back to null rather than logging an empty string.
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return headers.get("x-real-ip");
}

function extractUserAgent(headers: Headers | null): string | null {
  if (!headers) return null;
  const ua = headers.get("user-agent");
  return ua ? ua.slice(0, 512) : null; // truncate aggressively
}
