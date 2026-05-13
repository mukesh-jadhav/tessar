/**
 * Run intake — schema + server-only `createRun`.
 *
 * Boundary contract for `POST /api/runs`. This is the single entry point
 * for new orchestrator jobs. Per ADR-0009 it ONLY inserts the Run row;
 * the actual Pub/Sub publish is gated on Stripe Checkout completion and
 * fires from `enqueueRun()` in the webhook handler.
 */
import "server-only";

import { z } from "zod";

import { prisma } from "@/lib/db";
import { PRICE_PER_RUN_USD } from "@/lib/pricing";

// ─── Validation ─────────────────────────────────────────────────────────────

export const briefInputSchema = z.object({
  // Free-text brief. Lower bound matches the UI's `canSubmit` threshold;
  // upper bound prevents accidental pasting of huge documents.
  brief: z.string().min(80).max(20_000),
  // Wizard answers from /brief. Optional — the orchestrator falls back to
  // sensible defaults when fields are missing.
  guide: z
    .object({
      domain: z.enum(["b2b", "b2c", "marketplace", "data", "internal", "other"]).optional(),
      scale: z.enum(["small", "growing", "large", "huge"]).optional(),
      region: z.enum(["us", "eu", "asia", "global"]).optional(),
      cloud: z.enum(["any", "gcp", "aws", "azure"]).optional(),
      compliance: z.enum(["none", "gdpr", "hipaa", "soc2", "pci"]).optional(),
      latency: z.enum(["relaxed", "standard", "tight"]).optional(),
      budget: z.enum(["lean", "standard", "generous"]).optional(),
    })
    .partial()
    .optional(),
});

export type BriefInput = z.infer<typeof briefInputSchema>;

// ─── Mutation ───────────────────────────────────────────────────────────────

export async function createRun(input: BriefInput, userId: string): Promise<{ runId: string }> {
  const run = await prisma.run.create({
    data: {
      userId,
      status: "pending",
      paymentStatus: "pending",
      briefJson: { brief: input.brief, guide: input.guide ?? {} },
      priceCents: Math.round(PRICE_PER_RUN_USD * 100),
    },
    select: { id: true },
  });

  return { runId: run.id };
}
