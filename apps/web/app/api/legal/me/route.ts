/**
 * GET /api/legal/me — returns the signed-in user's latest accepted Terms
 * version (or null). Used by <TermsConsentBanner> to decide whether to
 * show. Returns 401 when unauthenticated so the banner stays hidden on
 * public pages. See ADR-0011.
 */
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { latestTermsVersion: true },
  });
  return NextResponse.json({ latestTermsVersion: user?.latestTermsVersion ?? null });
}
