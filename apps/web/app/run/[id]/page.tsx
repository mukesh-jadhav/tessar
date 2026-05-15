/**
 * /run/[id] — "Watching an analyst work."
 *
 * Server Component. Auth-gates the view, fetches the brief that kicked off
 * this run (so the live screen always echoes what the user asked for), then
 * hands off to <RunWatch /> which subscribes to the SSE event stream.
 *
 * Auth model:
 *   - Must be signed in
 *   - Caller must own the run
 *
 * Why the brief is read here (server) and not from the SSE stream:
 *   the orchestrator's events are about *progress*, not *context*. The
 *   user already wrote the brief — we just need to surface it. Reading
 *   from `Run.briefJson` keeps the wire format unchanged.
 */
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";

import { RunWatch } from "./run-watch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function RunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactElement> {
  const { id } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/signin?from=${encodeURIComponent(`/run/${id}`)}`);
  }

  const run = await prisma.run.findUnique({
    where: { id },
    select: { id: true, userId: true, briefJson: true },
  });
  if (!run) notFound();
  if (run.userId !== session.user.id) notFound();

  const briefBody = extractBriefBody(run.briefJson);
  const briefTitle = deriveBriefTitle(briefBody);

  return <RunWatch runId={id} briefTitle={briefTitle} briefBody={briefBody} />;
}

function extractBriefBody(briefJson: unknown): string {
  if (briefJson && typeof briefJson === "object") {
    const j = briefJson as { brief?: unknown };
    if (typeof j.brief === "string") return j.brief;
  }
  return "";
}

function deriveBriefTitle(body: string): string {
  const firstLine =
    body
      .split("\n")
      .map((s) => s.trim())
      .find(Boolean) ?? "Untitled run";
  return firstLine.length > 90 ? firstLine.slice(0, 87) + "…" : firstLine;
}
