/**
 * POST /api/stripe/webhook
 *
 * Stripe webhook receiver. Verifies the signature with
 * ``STRIPE_WEBHOOK_SECRET`` and processes the events listed in ADR-0009.
 *
 * This endpoint is **auth-public** (Stripe doesn't carry a user
 * session). Authenticity is enforced by the signature check; any
 * unsigned/forged request gets a 400.
 *
 * Handlers are idempotent — Stripe retries on 5xx, and rare
 * out-of-order delivery means we may see ``async_payment_succeeded``
 * after ``checkout.session.completed`` (or vice versa). We use the
 * Run's ``paymentStatus`` as the source of truth and short-circuit
 * when already in the target state.
 *
 * The Run is enqueued to Pub/Sub here, after we flip ``paymentStatus``
 * to ``paid``. If publish fails we throw → 500 → Stripe retries.
 */
import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { prisma } from "@/lib/db";
import { enqueueRun } from "@/lib/runs/enqueue";
import { getStripe, getStripeWebhookSecret } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<NextResponse> {
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "missing_signature" }, { status: 400 });
  }

  // Raw body MUST be the exact bytes Stripe signed. ``req.text()`` in
  // Node runtime preserves them verbatim.
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, sig, getStripeWebhookSecret());
  } catch (err) {
    console.warn("[stripe webhook] signature verify failed", {
      message: (err as Error).message,
    });
    return NextResponse.json({ error: "bad_signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const s = event.data.object as Stripe.Checkout.Session;
        // Skip terminal-failed and async-pending sessions — only "paid"
        // payment_status means the money actually moved.
        if (s.payment_status !== "paid") break;
        await markPaidAndEnqueue(s);
        break;
      }
      case "checkout.session.expired":
      case "checkout.session.async_payment_failed": {
        const s = event.data.object as Stripe.Checkout.Session;
        await markFailed(s);
        break;
      }
      case "charge.refunded": {
        const c = event.data.object as Stripe.Charge;
        await markRefunded(c);
        break;
      }
      default:
        // Acknowledged but not handled. Stripe will keep delivering
        // many event types we never enabled; logging at debug avoids noise.
        break;
    }
  } catch (err) {
    console.error("[stripe webhook] handler error", {
      type: event.type,
      id: event.id,
      message: (err as Error).message,
    });
    // 500 → Stripe retries with exponential backoff.
    return NextResponse.json({ error: "handler_error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

// ─── Handlers ───────────────────────────────────────────────────────────────

async function markPaidAndEnqueue(s: Stripe.Checkout.Session): Promise<void> {
  const run = await findRunForSession(s);
  if (!run) {
    console.warn("[stripe webhook] no Run for session", { sessionId: s.id });
    return;
  }

  if (run.paymentStatus === "paid") {
    // Idempotent re-delivery. Re-call enqueueRun in case the original
    // publish 5xx'd before Stripe got our 200.
    await enqueueRun(run.id);
    return;
  }

  await prisma.run.update({
    where: { id: run.id },
    data: {
      paymentStatus: "paid",
      paidAt: new Date(),
      stripePaymentIntent: typeof s.payment_intent === "string" ? s.payment_intent : null,
    },
  });

  const result = await enqueueRun(run.id);
  if (!result.ok) {
    // `enqueueRun` only returns !ok for missing/unpaid; we just set paid.
    throw new Error(`enqueueRun rejected paid run ${run.id}: ${result.reason}`);
  }
}

async function markFailed(s: Stripe.Checkout.Session): Promise<void> {
  const run = await findRunForSession(s);
  if (!run) return;
  if (run.paymentStatus === "paid" || run.paymentStatus === "refunded") return;
  await prisma.run.update({
    where: { id: run.id },
    data: { paymentStatus: "failed" },
  });
}

async function markRefunded(charge: Stripe.Charge): Promise<void> {
  // Refunds carry the PaymentIntent, not the Checkout Session id.
  const pi = typeof charge.payment_intent === "string" ? charge.payment_intent : null;
  if (!pi) return;
  const run = await prisma.run.findFirst({
    where: { stripePaymentIntent: pi },
    select: { id: true, paymentStatus: true },
  });
  if (!run) return;
  if (run.paymentStatus === "refunded") return;
  await prisma.run.update({
    where: { id: run.id },
    data: { paymentStatus: "refunded", refundedAt: new Date() },
  });
}

// ─── Lookup helpers ─────────────────────────────────────────────────────────

async function findRunForSession(s: Stripe.Checkout.Session) {
  // Prefer client_reference_id (we set it = runId on creation). Fall back
  // to the persisted session id mapping for sessions created out-of-band.
  const runIdFromRef = typeof s.client_reference_id === "string" ? s.client_reference_id : null;
  if (runIdFromRef) {
    const r = await prisma.run.findUnique({
      where: { id: runIdFromRef },
      select: { id: true, paymentStatus: true },
    });
    if (r) return r;
  }
  return prisma.run.findUnique({
    where: { stripeCheckoutSessionId: s.id },
    select: { id: true, paymentStatus: true },
  });
}
