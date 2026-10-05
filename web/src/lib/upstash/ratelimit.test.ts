import { describe, expect, it } from "vitest";
import { rateCheck } from "@/lib/coach/chat-rules";
import { FEED_LIMIT, feedWindow, SLOT_LIMITS, type SlotKind } from "./ratelimit";

describe("SLOT_LIMITS", () => {
  it("has a ceiling for every paid action, and for problem reports", () => {
    expect(Object.keys(SLOT_LIMITS).toSorted()).toEqual(["grade", "mock", "report", "review"]);
    for (const kind of Object.values(SLOT_LIMITS)) {
      expect(kind.limit).toBeGreaterThan(0);
      expect(kind.windowMs).toBeGreaterThan(0);
    }
  });
});

describe("the paid-action ceiling, via the shared sliding window", () => {
  const now = 1_700_000_000_000;
  const kind: SlotKind = "review";

  it("allows within the window and stores the new stamp", () => {
    const out = rateCheck([], now, SLOT_LIMITS[kind]);
    expect(out.allowed).toBe(true);
    expect(out.stamps).toEqual([now]);
  });

  it("refuses past the ceiling and reports the wait", () => {
    const full = Array.from({ length: SLOT_LIMITS[kind].limit }, (_, i) => now - (i + 1) * 1000);
    const out = rateCheck(full, now, SLOT_LIMITS[kind]);
    expect(out.allowed).toBe(false);
    expect(out.retryAfterSec).toBeGreaterThan(0);
  });

  it("lets a stamp older than the window fall away", () => {
    const stale = now - SLOT_LIMITS[kind].windowMs - 1000;
    const out = rateCheck([stale], now, SLOT_LIMITS[kind]);
    expect(out.allowed).toBe(true);
    expect(out.stamps).toEqual([now]);
  });
});

describe("the Feed allowance", () => {
  it("is far above a real reader and finite", () => {
    expect(FEED_LIMIT.limit).toBeGreaterThanOrEqual(200);
    expect(FEED_LIMIT.limit).toBeLessThanOrEqual(1000);
  });

  it("puts moments in the same hour in one window and the next hour in another", () => {
    const hour = FEED_LIMIT.windowSeconds * 1000;
    const start = Math.floor(1_700_000_000_000 / hour) * hour;
    expect(feedWindow(start)).toBe(feedWindow(start + hour - 1));
    expect(feedWindow(start + hour)).toBe(feedWindow(start) + 1);
  });
});
