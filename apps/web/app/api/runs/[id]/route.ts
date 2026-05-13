/**
 * GET /api/runs/[id] — auth-gated run detail.
 *
 * Returns the run row + its artifacts. Used by /run/[id] for the
 * post-done CTA (and to recover state on a hard refresh after the
 * SSE stream has closed) and by /dashboard for per-card lookups.
 *
 * Never returns the raw GCS URI to the browser. The download URL points
 * at our own `/api/runs/[id]/artifact/[kind]` route, which proxies the
 * bytes after re-checking ownership.
 */
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const run = await prisma.run.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      status: true,
      briefJson: true,
      priceCents: true,
      createdAt: true,
      completedAt: true,
      artifacts: {
        select: {
          id: true,
          kind: true,
          mime: true,
          bytes: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!run) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (run.userId !== session.user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    run: {
      id: run.id,
      status: run.status,
      brief: run.briefJson,
      priceCents: run.priceCents,
      createdAt: run.createdAt.toISOString(),
      completedAt: run.completedAt?.toISOString() ?? null,
    },
    artifacts: run.artifacts.map((a) => ({
      id: a.id,
      kind: a.kind,
      mime: a.mime,
      bytes: a.bytes,
      createdAt: a.createdAt.toISOString(),
      // Stable, auth-gated URL the client can hand to <a download>.
      url: `/api/runs/${run.id}/artifact/${a.kind}`,
    })),
  });
}
