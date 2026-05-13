import { NextRequest } from "next/server";

import {
  RECORDED_RUN,
  type RecordedEvent,
} from "@/lib/mocks/recorded-run";

/**
 * Mock SSE endpoint — replays a recorded run for the UI prototype.
 *
 * Phase 2 will swap the body of this handler for a real Redis-Stream
 * subscription, but the wire format is the contract: the client expects
 * `data: <json>\n\n` frames where each json matches `RecordedEvent`.
 *
 * Query params:
 *   ?speed=1   — playback multiplier (default 1, accepts 1..50)
 *   ?seek=123  — start at event index N (default 0); used to "rejoin" a run
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  // The id is currently just echoed in the first event so the client can
  // assert it matches the run it requested. Phase 2 will use it to pick a
  // real Redis stream key.
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const speed = clamp(Number(url.searchParams.get("speed") ?? "1") || 1, 1, 50);
  const seek = clamp(Number(url.searchParams.get("seek") ?? "0") || 0, 0, RECORDED_RUN.length - 1);

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (ev: RecordedEvent): void => {
        controller.enqueue(
          encoder.encode(`event: ${ev.kind}\ndata: ${JSON.stringify({ ...ev, runId: id })}\n\n`),
        );
      };

      // Always emit a synthetic "hello" so the client can render the shell
      // before the first real event lands.
      send({ kind: "hello", t: 0, payload: { runId: id } } as unknown as RecordedEvent);

      // Walk the recorded timeline. `t` is the event's offset in ms from
      // run start; we sleep the *delta* (scaled by speed) between events.
      let prevT = RECORDED_RUN[seek]?.t ?? 0;
      const aborted = { v: false };
      req.signal.addEventListener("abort", () => {
        aborted.v = true;
      });

      for (let i = seek; i < RECORDED_RUN.length; i += 1) {
        if (aborted.v) break;
        const ev = RECORDED_RUN[i]!;
        const dt = Math.max(0, ev.t - prevT) / speed;
        if (dt > 0) await sleep(dt);
        if (aborted.v) break;
        send(ev);
        prevT = ev.t;
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
      connection: "keep-alive",
    },
  });
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
