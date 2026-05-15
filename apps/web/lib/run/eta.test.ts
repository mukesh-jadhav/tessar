import { describe, expect, it } from "vitest";

import { estimateRemainingMs, formatEta } from "./eta";

describe("estimateRemainingMs", () => {
  it("returns null when inputs are invalid", () => {
    expect(estimateRemainingMs(Number.NaN, 0, 9)).toBeNull();
    expect(estimateRemainingMs(-1, 0, 9)).toBeNull();
    expect(estimateRemainingMs(1000, 0, 0)).toBeNull();
  });

  it("returns 0 when all phases done", () => {
    expect(estimateRemainingMs(60_000, 9, 9)).toBe(0);
    expect(estimateRemainingMs(60_000, 10, 9)).toBe(0);
  });

  it("anchors on the 12-minute target before the first phase completes", () => {
    // 1 minute in, no phases done — should aim ~11 min remaining.
    const ms = estimateRemainingMs(60_000, 0, 9) ?? 0;
    expect(ms).toBeGreaterThan(10 * 60_000);
    expect(ms).toBeLessThanOrEqual(11 * 60_000);
  });

  it("never returns less than 30 seconds while still running", () => {
    expect(estimateRemainingMs(60 * 60_000, 0, 9)).toBeGreaterThanOrEqual(30_000);
    expect(estimateRemainingMs(8 * 60_000, 8, 9)).toBeGreaterThanOrEqual(30_000);
  });

  it("extrapolates from per-phase pace once phases complete", () => {
    // 4 phases done in 2 minutes → 30s/phase. 5 phases left → 150s.
    const ms = estimateRemainingMs(120_000, 4, 9) ?? 0;
    expect(ms).toBe(150_000);
  });
});

describe("formatEta", () => {
  it("formats common cases", () => {
    expect(formatEta(null)).toBe("estimating…");
    expect(formatEta(0)).toBe("wrapping up");
    expect(formatEta(20_000)).toBe("less than a minute left");
    expect(formatEta(3 * 60_000)).toBe("about 3 minutes left");
    expect(formatEta(20 * 60_000)).toBe("10–15 minutes left");
  });
});
