/**
 * Tests for the Stripe webhook receiver.
 *
 * Strategy:
 *   - Mock Prisma + `enqueueRun` so we only verify the handler logic.
 *   - Build real signed payloads with the Stripe SDK's signing helpers
 *     (so signature verification exercises real code paths).
 *   - Drive a fresh module load per test where state must be isolated.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Stripe from "stripe";

const WEBHOOK_SECRET = "whsec_dummy_for_vitest";
process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
process.env.STRIPE_SECRET_KEY = "sk_test_dummy_for_vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    run: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));
vi.mock("@/lib/runs/enqueue", () => ({
  enqueueRun: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { enqueueRun } from "@/lib/runs/enqueue";
import { POST } from "@/app/api/stripe/webhook/route";

const findUnique = prisma.run.findUnique as unknown as ReturnType<typeof vi.fn>;
const findFirst = prisma.run.findFirst as unknown as ReturnType<typeof vi.fn>;
const update = prisma.run.update as unknown as ReturnType<typeof vi.fn>;
const enqueueMock = enqueueRun as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  findUnique.mockReset();
  findFirst.mockReset();
  update.mockReset();
  enqueueMock.mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
});

/** Build a Stripe-signed Request for the given event payload. */
function signedReq(payload: object): Request {
  const body = JSON.stringify(payload);
  const header = Stripe.webhooks.generateTestHeaderString({
    payload: body,
    secret: WEBHOOK_SECRET,
  });
  return new Request("http://localhost/api/stripe/webhook", {
    method: "POST",
    headers: { "stripe-signature": header, "content-type": "application/json" },
    body,
  });
}

function checkoutCompletedEvent(opts: {
  sessionId: string;
  runId: string;
  userId: string;
  paymentStatus?: "paid" | "unpaid";
  paymentIntent?: string;
}) {
  return {
    id: "evt_test_1",
    object: "event",
    type: "checkout.session.completed",
    api_version: "2025-02-24.acacia",
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: opts.sessionId,
        object: "checkout.session",
        client_reference_id: opts.runId,
        metadata: { runId: opts.runId, userId: opts.userId },
        payment_status: opts.paymentStatus ?? "paid",
        payment_intent: opts.paymentIntent ?? "pi_test_1",
        status: "complete",
      },
    },
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
  };
}

describe("POST /api/stripe/webhook", () => {
  it("rejects requests without a signature", async () => {
    const res = await POST(
      new Request("http://localhost/api/stripe/webhook", {
        method: "POST",
        body: "{}",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects requests with a forged signature", async () => {
    const res = await POST(
      new Request("http://localhost/api/stripe/webhook", {
        method: "POST",
        headers: { "stripe-signature": "t=1,v1=deadbeef" },
        body: JSON.stringify({ type: "checkout.session.completed" }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("on checkout.session.completed: marks paid + enqueues", async () => {
    findUnique.mockResolvedValueOnce({ id: "r1", paymentStatus: "pending" });
    update.mockResolvedValueOnce({});
    enqueueMock.mockResolvedValueOnce({ ok: true, alreadyRunning: false });

    const res = await POST(
      signedReq(
        checkoutCompletedEvent({
          sessionId: "cs_test_1",
          runId: "r1",
          userId: "u1",
        }),
      ),
    );

    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0]![0]).toMatchObject({
      where: { id: "r1" },
      data: { paymentStatus: "paid", stripePaymentIntent: "pi_test_1" },
    });
    expect(enqueueMock).toHaveBeenCalledWith("r1");
  });

  it("is idempotent: duplicate completed event does not re-update", async () => {
    findUnique.mockResolvedValueOnce({ id: "r1", paymentStatus: "paid" });
    enqueueMock.mockResolvedValueOnce({ ok: true, alreadyRunning: true });

    const res = await POST(
      signedReq(
        checkoutCompletedEvent({
          sessionId: "cs_test_1",
          runId: "r1",
          userId: "u1",
        }),
      ),
    );

    expect(res.status).toBe(200);
    expect(update).not.toHaveBeenCalled();
    expect(enqueueMock).toHaveBeenCalledWith("r1");
  });

  it("ignores completed events whose payment_status !== paid", async () => {
    const res = await POST(
      signedReq(
        checkoutCompletedEvent({
          sessionId: "cs_test_2",
          runId: "r2",
          userId: "u1",
          paymentStatus: "unpaid",
        }),
      ),
    );
    expect(res.status).toBe(200);
    expect(update).not.toHaveBeenCalled();
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it("on checkout.session.expired: marks failed", async () => {
    findUnique.mockResolvedValueOnce({ id: "r3", paymentStatus: "pending" });
    update.mockResolvedValueOnce({});

    const expiredEvent = {
      ...checkoutCompletedEvent({
        sessionId: "cs_test_3",
        runId: "r3",
        userId: "u1",
      }),
      type: "checkout.session.expired",
    };
    expiredEvent.data.object.status = "expired";

    const res = await POST(signedReq(expiredEvent));
    expect(res.status).toBe(200);
    expect(update.mock.calls[0]![0]).toMatchObject({
      where: { id: "r3" },
      data: { paymentStatus: "failed" },
    });
  });

  it("on charge.refunded: marks refunded", async () => {
    findFirst.mockResolvedValueOnce({ id: "r4", paymentStatus: "paid" });
    update.mockResolvedValueOnce({});

    const refundEvent = {
      id: "evt_test_refund",
      object: "event",
      type: "charge.refunded",
      api_version: "2025-02-24.acacia",
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: "ch_test_1",
          object: "charge",
          payment_intent: "pi_test_1",
          refunded: true,
        },
      },
      livemode: false,
      pending_webhooks: 1,
      request: { id: null, idempotency_key: null },
    };

    const res = await POST(signedReq(refundEvent));
    expect(res.status).toBe(200);
    expect(findFirst).toHaveBeenCalledWith({
      where: { stripePaymentIntent: "pi_test_1" },
      select: { id: true, paymentStatus: true },
    });
    expect(update.mock.calls[0]![0]).toMatchObject({
      where: { id: "r4" },
      data: { paymentStatus: "refunded" },
    });
  });

  it("returns 200 for unhandled event types without touching the DB", async () => {
    const otherEvent = {
      id: "evt_test_other",
      object: "event",
      type: "customer.created",
      api_version: "2025-02-24.acacia",
      created: Math.floor(Date.now() / 1000),
      data: { object: { id: "cus_test_1", object: "customer" } },
      livemode: false,
      pending_webhooks: 1,
      request: { id: null, idempotency_key: null },
    };
    const res = await POST(signedReq(otherEvent));
    expect(res.status).toBe(200);
    expect(update).not.toHaveBeenCalled();
    expect(enqueueMock).not.toHaveBeenCalled();
  });
});
