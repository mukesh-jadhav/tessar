import "server-only";

import Redis from "ioredis";

/**
 * Redis adapter for live run-progress events.
 *
 * Worker writes wire-format SSE events into `run:{runId}:events` Redis
 * Streams; this module owns the **single shared client** the SSE route
 * uses to `XRANGE` (replay) and `XREAD BLOCK 0` (live tail).
 *
 * Why a singleton: each `XREAD BLOCK 0` connection holds a TCP socket
 * for the lifetime of the SSE stream. We give that consumer its own
 * `duplicate()` (see `subscriberClient`) so blocking reads don't starve
 * other commands. The base client is reused across requests via the
 * standard Next-dev hot-reload trick (cache on globalThis).
 */

declare global {
  // eslint-disable-next-line no-var
  var __tessarRedis: Redis | undefined;
}

const URL = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";

function client(): Redis {
  if (!globalThis.__tessarRedis) {
    globalThis.__tessarRedis = new Redis(URL, {
      // We don't want a single bad command to spin retries forever and
      // mask the failure from the SSE handler — let it bubble up.
      maxRetriesPerRequest: 3,
      lazyConnect: false,
    });
    globalThis.__tessarRedis.on("error", (err) => {
      console.warn("[redis] error:", err.message);
    });
  }
  return globalThis.__tessarRedis;
}

export function streamKey(runId: string): string {
  return `run:${runId}:events`;
}

/**
 * Replay every event currently in the stream (oldest → newest).
 * Returns the parsed wire-format objects + the **last entry id** so the
 * caller can hand it straight to `subscribe(..., lastId)` without races.
 */
export async function replay(runId: string): Promise<{
  events: unknown[];
  lastId: string;
}> {
  const entries = await client().xrange(streamKey(runId), "-", "+");
  const events: unknown[] = [];
  let lastId = "0";
  for (const [id, fields] of entries) {
    lastId = id;
    const data = pickField(fields, "data");
    if (data) {
      try {
        events.push(JSON.parse(data));
      } catch {
        // Skip malformed; the durable copy in Postgres has the truth.
      }
    }
  }
  return { events, lastId };
}

/**
 * Subscribe to new events past `afterId` (use `"$"` for "only events
 * arriving after this call" or the value returned by `replay()`).
 *
 * Yields wire-format objects. The generator returns when the caller's
 * AbortSignal fires or the connection drops; callers should always
 * await the generator inside try/finally so the duplicated client is
 * `.disconnect()`-ed.
 */
export async function* subscribe(
  runId: string,
  afterId: string,
  signal: AbortSignal,
): AsyncGenerator<unknown> {
  // A blocking XREAD ties up the connection — give it its own socket so
  // it cannot block the shared client.
  const sub = client().duplicate();
  try {
    let cursor = afterId;
    while (!signal.aborted) {
      // BLOCK 15000 (15 s): if nothing arrives we loop and re-check the
      // abort signal. Lower latency than BLOCK 0 with no real cost.
      const res = (await sub.xread("BLOCK", 15_000, "STREAMS", streamKey(runId), cursor)) as Array<
        [string, Array<[string, string[]]>]
      > | null;
      if (signal.aborted) break;
      if (!res) continue;
      for (const [, entries] of res) {
        for (const [id, fields] of entries) {
          cursor = id;
          const data = pickField(fields, "data");
          if (!data) continue;
          try {
            yield JSON.parse(data);
          } catch {
            // skip malformed
          }
        }
      }
    }
  } finally {
    sub.disconnect();
  }
}

function pickField(fields: string[], name: string): string | null {
  // Redis returns flat [k1, v1, k2, v2 …] arrays.
  for (let i = 0; i < fields.length; i += 2) {
    if (fields[i] === name) return fields[i + 1] ?? null;
  }
  return null;
}
