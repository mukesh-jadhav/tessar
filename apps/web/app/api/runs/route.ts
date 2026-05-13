/**
 * /api/runs
 *
 *   POST  — create a new run from a brief.
 *   GET   — list the signed-in user's runs (used by /dashboard).
 *
 * Both auth-gated.
 *
 * Per ADR-0009: POST inserts the Run row at `paymentStatus=pending`.
 * The actual Pub/Sub publish is deferred to the Stripe webhook handler
 * after Checkout completes.
 */
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { briefInputSchema, createRun } from "@/lib/runs/create";
import type { RunStatus, RunSummary } from "@/lib/mocks/past-runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = briefInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  try {
    const { runId } = await createRun(parsed.data, session.user.id);
    return NextResponse.json({ runId }, { status: 201 });
  } catch (err) {
    const e = err as { code?: unknown; details?: unknown; message?: string };
    console.error("[/api/runs] createRun failed", {
      code: e.code,
      details: e.details,
      message: e.message,
      err,
    });
    return NextResponse.json({ error: "create_failed" }, { status: 500 });
  }
}

// ─── GET ───────────────────────────────────────────────────────────

const DOMAIN_LABEL: Record<string, string> = {
  b2b: "B2B SaaS",
  b2c: "B2C SaaS",
  marketplace: "Marketplace",
  data: "Data product",
  internal: "Internal tool",
  other: "Other",
};

function mapStatus(s: string): RunStatus {
  switch (s) {
    case "succeeded":
      return "completed";
    case "failed":
      return "failed";
    case "refunded":
      return "refunded";
    default:
      return "in_progress"; // pending | running
  }
}

function summarizeBrief(briefJson: unknown): { brief: string; domain: string } {
  if (briefJson && typeof briefJson === "object") {
    const j = briefJson as { brief?: unknown; guide?: { domain?: unknown } };
    const briefText = typeof j.brief === "string" ? j.brief : "";
    const trimmed = briefText.length > 90 ? `${briefText.slice(0, 87).trimEnd()}…` : briefText;
    const domainKey = typeof j.guide?.domain === "string" ? j.guide.domain : "other";
    return { brief: trimmed || "Untitled brief", domain: DOMAIN_LABEL[domainKey] ?? "Other" };
  }
  return { brief: "Untitled brief", domain: "Other" };
}

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const rows = await prisma.run.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      status: true,
      briefJson: true,
      priceCents: true,
      createdAt: true,
      completedAt: true,
    },
  });

  // Bulk-fetch decision/source counts in one groupBy each. Avoids N+1.
  const ids = rows.map((r) => r.id);
  const [decisionCounts, sourceCounts] = await Promise.all([
    ids.length === 0
      ? []
      : prisma.runEvent.groupBy({
          by: ["runId"],
          where: { runId: { in: ids }, kind: "decision" },
          _count: { _all: true },
        }),
    ids.length === 0
      ? []
      : prisma.runEvent.groupBy({
          by: ["runId"],
          where: { runId: { in: ids }, kind: "source" },
          _count: { _all: true },
        }),
  ]);
  const decisionByRun = new Map(decisionCounts.map((d) => [d.runId, d._count._all]));
  const sourceByRun = new Map(sourceCounts.map((d) => [d.runId, d._count._all]));

  const summaries: RunSummary[] = rows.map((r) => {
    const { brief, domain } = summarizeBrief(r.briefJson);
    const status = mapStatus(r.status);
    const durationSec =
      r.completedAt && r.createdAt
        ? Math.max(0, Math.round((r.completedAt.getTime() - r.createdAt.getTime()) / 1000))
        : 0;
    return {
      id: r.id,
      brief,
      status,
      domain,
      createdAt: r.createdAt.toISOString(),
      durationSec,
      paidUsd: status === "completed" ? Math.round(r.priceCents / 100) : 0,
      components: decisionByRun.get(r.id) ?? 0,
      sources: sourceByRun.get(r.id) ?? 0,
    };
  });

  return NextResponse.json({ runs: summaries });
}
