/**
 * Tests for the post-payment enqueue gatekeeper.
 *
 * Mocks the Prisma client and Pub/Sub publisher; we only verify the
 * decision logic in `enqueueRun`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: { run: { findUnique: vi.fn() } },
}));
vi.mock("@/lib/queue/pubsub", () => ({
  publishRunEnqueued: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { publishRunEnqueued } from "@/lib/queue/pubsub";
import { enqueueRun } from "@/lib/runs/enqueue";

const findUniqueMock = prisma.run.findUnique as unknown as ReturnType<typeof vi.fn>;
const publishMock = publishRunEnqueued as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  findUniqueMock.mockReset();
  publishMock.mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("enqueueRun", () => {
  it("returns not_found when the run row is missing", async () => {
    findUniqueMock.mockResolvedValueOnce(null);
    const result = await enqueueRun("missing");
    expect(result).toEqual({ ok: false, reason: "not_found" });
    expect(publishMock).not.toHaveBeenCalled();
  });

  it("returns not_paid when paymentStatus !== paid", async () => {
    findUniqueMock.mockResolvedValueOnce({
      id: "r1",
      userId: "u1",
      status: "pending",
      paymentStatus: "pending",
    });
    const result = await enqueueRun("r1");
    expect(result).toEqual({ ok: false, reason: "not_paid" });
    expect(publishMock).not.toHaveBeenCalled();
  });

  it("publishes once for paid + pending run", async () => {
    findUniqueMock.mockResolvedValueOnce({
      id: "r1",
      userId: "u1",
      status: "pending",
      paymentStatus: "paid",
    });
    publishMock.mockResolvedValueOnce(undefined);
    const result = await enqueueRun("r1");
    expect(result).toEqual({ ok: true, alreadyRunning: false });
    expect(publishMock).toHaveBeenCalledTimes(1);
    expect(publishMock).toHaveBeenCalledWith({ runId: "r1", userId: "u1", v: 1 });
  });

  it("skips publish when run is already past pending (idempotent)", async () => {
    findUniqueMock.mockResolvedValueOnce({
      id: "r1",
      userId: "u1",
      status: "running",
      paymentStatus: "paid",
    });
    const result = await enqueueRun("r1");
    expect(result).toEqual({ ok: true, alreadyRunning: true });
    expect(publishMock).not.toHaveBeenCalled();
  });

  it("propagates publish errors so callers can retry", async () => {
    findUniqueMock.mockResolvedValueOnce({
      id: "r1",
      userId: "u1",
      status: "pending",
      paymentStatus: "paid",
    });
    publishMock.mockRejectedValueOnce(new Error("pubsub down"));
    await expect(enqueueRun("r1")).rejects.toThrow("pubsub down");
  });
});
