/**
 * Run lifecycle helpers for the Stripe-paywall flow (ADR-0009).
 *
 * Split from `createRun()`:
 *
 *   - `createRun()` only inserts the Run row (status=`pending`,
 *     paymentStatus=`pending`). It does NOT publish to Pub/Sub.
 *   - `enqueueRun()` is called from the Stripe webhook handler after a
 *     successful Checkout Session completes. It publishes
 *     `RunEnqueued` to `tessar-runs`. Idempotent: safe to call twice
 *     for the same runId — Pub/Sub is at-least-once anyway, and the
 *     worker rejects already-running runs.
 *
 * The webhook is the source of truth for "this run is paid and ready
 * to dispatch". The browser-facing `/checkout/success` redirect is
 * cosmetic.
 */
import "server-only";

import { prisma } from "@/lib/db";
import { publishRunEnqueued } from "@/lib/queue/pubsub";

export type EnqueueResult =
  | { ok: true; alreadyRunning: false }
  | { ok: true; alreadyRunning: true }
  | { ok: false; reason: "not_paid" | "not_found" };

/**
 * Publish `RunEnqueued` for a paid run. Idempotent.
 *
 * Caller MUST have just transitioned (or verified) `paymentStatus = paid`
 * inside the same transaction or webhook handler. We re-check here as a
 * defense-in-depth measure so a misuse can't enqueue an unpaid run.
 */
export async function enqueueRun(runId: string): Promise<EnqueueResult> {
  const row = await prisma.run.findUnique({
    where: { id: runId },
    select: { id: true, userId: true, status: true, paymentStatus: true },
  });
  if (!row) return { ok: false, reason: "not_found" };
  if (row.paymentStatus !== "paid") return { ok: false, reason: "not_paid" };

  // If the worker already picked it up (status moved past `pending`),
  // skip the publish so we don't double-dispatch.
  if (row.status !== "pending") {
    return { ok: true, alreadyRunning: true };
  }

  await publishRunEnqueued({ runId: row.id, userId: row.userId, v: 1 });
  return { ok: true, alreadyRunning: false };
}
