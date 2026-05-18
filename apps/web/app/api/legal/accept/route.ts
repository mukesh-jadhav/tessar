/**
 * POST /api/legal/accept
 *
 * Records an explicit re-consent click from the in-app `<TermsConsentBanner>`.
 * Auth-gated. Writes a `TermsAcceptance` row with `context = "reaccept"`
 * and bumps `User.latestTermsVersion` so the banner stops appearing.
 *
 * Body: empty. The user is consenting to whatever the server-side
 * TERMS_VERSION / PRIVACY_VERSION constants currently say — the client
 * cannot smuggle a different version in.
 *
 * See ADR-0011.
 */
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { recordConsent } from "@/lib/legal-consent";
import { TERMS_VERSION, PRIVACY_VERSION } from "@/lib/legal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  try {
    await recordConsent({
      userId: session.user.id,
      context: "reaccept",
      headers: req.headers,
    });
  } catch (err) {
    console.error("[/api/legal/accept] recordConsent failed", {
      userId: session.user.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
  return NextResponse.json({
    ok: true,
    termsVersion: TERMS_VERSION,
    privacyVersion: PRIVACY_VERSION,
  });
}
