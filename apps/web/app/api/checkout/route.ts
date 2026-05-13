/**
 * POST /api/checkout
 *
 * Body: ``{ runId: string }``
 *
 * Auth-gated. Re-checks Run ownership, then creates (or returns the
 * existing) Stripe Checkout Session for that Run and responds with the
 * hosted-Checkout URL the browser must redirect to.
 *
 * Idempotency:
 *
 * - We use Stripe's request idempotency key ``run-{runId}-checkout-v1``
 *   so retries by the browser cannot create duplicate sessions.
 * - We persist ``stripeCheckoutSessionId`` on the Run row. If the row
 *   already has a session id AND that session is still ``open`` in
 *   Stripe, we reuse its URL instead of creating a new session.
 * - If the Run is already paid, we return 409 — the front-end should
 *   redirect to ``/run/{id}`` instead.
 *
 * The Pub/Sub publish does NOT happen here. It happens in the webhook
 * handler after ``checkout.session.completed``. See ADR-0009.
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { enqueueRun } from "@/lib/runs/enqueue";
import { getReturnBaseUrl, getStripe } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  runId: z.string().min(1).max(64),
});

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

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 422 });
  }

  const { runId } = parsed.data;
  const userId = session.user.id;

  const run = await prisma.run.findUnique({
    where: { id: runId },
    select: {
      id: true,
      userId: true,
      paymentStatus: true,
      priceCents: true,
      stripeCheckoutSessionId: true,
      briefJson: true,
    },
  });
  if (!run) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (run.userId !== userId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (run.paymentStatus === "paid") {
    return NextResponse.json({ error: "already_paid" }, { status: 409 });
  }
  if (run.paymentStatus === "refunded") {
    return NextResponse.json({ error: "refunded" }, { status: 409 });
  }

  // ── Billing-disabled bypass ────────────────────────────────────────────
  // Pre-launch / dev environments set ``BILLING_ENABLED=false`` to skip
  // Stripe entirely. We mark the run paid in-process and enqueue it to
  // Pub/Sub right here, then redirect the browser straight to /run/{id}.
  // The Stripe webhook + SDK still ship in the image; flipping the flag
  // back on is enough to switch to real charging. ADR-0009.
  if (process.env.BILLING_ENABLED !== "true") {
    await prisma.run.update({
      where: { id: run.id },
      data: { paymentStatus: "paid", paidAt: new Date() },
    });
    const enqResult = await enqueueRun(run.id);
    if (!enqResult.ok) {
      console.error("[/api/checkout] billing-disabled enqueue failed", {
        runId: run.id,
        reason: enqResult.reason,
      });
      return NextResponse.json({ error: "enqueue_failed" }, { status: 502 });
    }
    return NextResponse.json({ url: `/run/${run.id}?paid=1`, billingDisabled: true });
  }

  const stripe = getStripe();
  const baseUrl = getReturnBaseUrl();
  const successUrl = `${baseUrl}/run/${run.id}?paid=1`;
  const cancelUrl = `${baseUrl}/checkout?run=${run.id}&canceled=1`;

  // Reuse an existing open session if one exists. Stripe sessions are
  // single-use; once `complete` they cannot be re-opened.
  if (run.stripeCheckoutSessionId) {
    try {
      const existing = await stripe.checkout.sessions.retrieve(run.stripeCheckoutSessionId);
      if (existing.status === "open" && existing.url) {
        return NextResponse.json({ url: existing.url, sessionId: existing.id });
      }
    } catch (err) {
      // The session id we stored may no longer exist (e.g. test-mode
      // reset). Fall through and mint a fresh one.
      console.warn("[/api/checkout] stale session id, recreating", {
        runId: run.id,
        err: (err as Error).message,
      });
    }
  }

  const briefSnippet = extractBriefSnippet(run.briefJson);

  let checkoutSession;
  try {
    checkoutSession = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        // Stripe-managed Checkout (hosted page).
        ui_mode: "hosted",
        client_reference_id: run.id,
        metadata: { runId: run.id, userId },
        // Stash on the resulting PaymentIntent too, so refunds can
        // trace back without joining the Session.
        payment_intent_data: {
          metadata: { runId: run.id, userId },
          description: `TESSAR architecture run ${run.id}`,
        },
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: run.priceCents,
              product_data: {
                name: "TESSAR architecture run",
                description: briefSnippet,
              },
            },
          },
        ],
        success_url: successUrl,
        cancel_url: cancelUrl,
        // Test-mode: collect email but don't enforce; Auth.js already has it.
        customer_email: session.user.email ?? undefined,
        // Force a 30-min expiry so abandoned sessions don't pile up.
        expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
      },
      {
        // Per ADR-0009: bump the suffix if the Session shape changes.
        idempotencyKey: `run-${run.id}-checkout-v1`,
      },
    );
  } catch (err) {
    console.error("[/api/checkout] stripe create failed", {
      runId: run.id,
      message: (err as Error).message,
    });
    return NextResponse.json({ error: "stripe_error" }, { status: 502 });
  }

  if (!checkoutSession.url) {
    return NextResponse.json({ error: "stripe_no_url" }, { status: 502 });
  }

  await prisma.run.update({
    where: { id: run.id },
    data: { stripeCheckoutSessionId: checkoutSession.id },
  });

  return NextResponse.json({ url: checkoutSession.url, sessionId: checkoutSession.id });
}

function extractBriefSnippet(briefJson: unknown): string {
  if (briefJson && typeof briefJson === "object") {
    const j = briefJson as { brief?: unknown };
    if (typeof j.brief === "string") {
      const trimmed = j.brief.trim();
      // Stripe truncates >5000 chars and the description shows on the receipt.
      return trimmed.length > 240 ? `${trimmed.slice(0, 237).trimEnd()}…` : trimmed;
    }
  }
  return "Architecture package generated by TESSAR.";
}
