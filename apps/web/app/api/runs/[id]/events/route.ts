/**
 * GET /api/runs/[id]/events — live SSE stream of a run's progress.
 *
 * Replaces `/api/mock-runs/[id]/events` (Phase 1). Wire format is
 * **identical** to the mock — events are JSON objects matching
 * `RecordedEvent` from `@/lib/mocks/recorded-run`. The worker writes
 * those exact shapes to Redis Stream `run:{runId}:events`; we stream
 * them to the browser unchanged.
 *
 * Lifecycle:
 *   1. Auth-gate: caller must own the run.
 *   2. Emit a synthetic `hello` so the client renders the shell.
 *   3. `XRANGE - +`: replay everything in the stream so a re-joining
 *      tab catches up. The Redis Stream is the source of truth for
 *      both live and replay (Postgres is the durable archive).
 *   4. `XREAD BLOCK 15000` from the last replayed id, forwarding new
 *      events until `done` lands or the client disconnects.
 *
 * SSE framing: each event is sent as `event: <kind>\ndata: <json>\n\n`
 * so the client can register per-kind listeners.
 */
import { NextRequest } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { replay, subscribe } from "@/lib/redis";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;

  const session = await auth();
  if (!session?.user?.id) {
    return new Response("unauthenticated", { status: 401 });
  }

  // Confirm ownership with a single indexed lookup. We only need
  // {userId, status} so the query stays cheap on the hot path.
  const run = await prisma.run.findUnique({
    where: { id },
    select: { userId: true, status: true },
  });
  if (!run) return new Response("not_found", { status: 404 });
  if (run.userId !== session.user.id) {
    return new Response("forbidden", { status: 403 });
  }

  const encoder = new TextEncoder();
  const ac = new AbortController();
  // Tear down the Redis subscription when the client navigates away.
  req.signal.addEventListener("abort", () => ac.abort());

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (ev: Record<string, unknown>): void => {
        const kind = String(ev.kind ?? "message");
        // Stamp runId on every payload so the client can defensively
        // assert it matches the route param.
        const body = JSON.stringify({ ...ev, runId: id });
        controller.enqueue(encoder.encode(`event: ${kind}\ndata: ${body}\n\n`));
      };

      // 1) Synthetic hello — lets the UI render its shell + show the
      //    "live" pill before the first real event arrives.
      send({ kind: "hello", t: 0, payload: { runId: id } });

      // 2) Replay everything currently in the stream. If the run has
      //    already finished we'll see the `done` event during replay
      //    and short-circuit.
      let lastId = "0";
      let alreadyDone = false;
      try {
        const r = await replay(id);
        lastId = r.lastId;
        for (const ev of r.events) {
          if (!ev || typeof ev !== "object") continue;
          send(ev as Record<string, unknown>);
          if ((ev as { kind?: string }).kind === "done") alreadyDone = true;
        }
      } catch (err) {
        console.warn("[sse] replay failed", err);
      }

      // 3) If the run already finished or was never enqueued to Redis
      //    but is terminal in DB, close cleanly. Otherwise tail.
      if (alreadyDone || isTerminal(run.status)) {
        controller.close();
        return;
      }

      try {
        for await (const ev of subscribe(id, lastId, ac.signal)) {
          if (!ev || typeof ev !== "object") continue;
          send(ev as Record<string, unknown>);
          if ((ev as { kind?: string }).kind === "done") {
            controller.close();
            return;
          }
        }
      } catch (err) {
        console.warn("[sse] subscribe failed", err);
      } finally {
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
    cancel() {
      ac.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      // Disable proxy buffering (Cloud Run / Cloud LB respect this).
      "x-accel-buffering": "no",
      connection: "keep-alive",
    },
  });
}

function isTerminal(status: string): boolean {
  return status === "succeeded" || status === "failed" || status === "refunded";
}
