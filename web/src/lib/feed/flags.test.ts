import { describe, expect, it } from "vitest";
import { FLAGS_TO_HIDE, shouldHideStale } from "./flags";

describe("flag rules", () => {
  it("hides a card at two flags", () => {
    expect(FLAGS_TO_HIDE).toBe(2);
  });

  it("hides a card everyone skipped for 14 days", () => {
    expect(shouldHideStale({ answers: 5, skips: 5, firstSeenDaysAgo: 14 })).toBe(true);
  });

  it("keeps it if anyone answered, or it's too new, or nobody saw it", () => {
    expect(shouldHideStale({ answers: 5, skips: 4, firstSeenDaysAgo: 30 })).toBe(false);
    expect(shouldHideStale({ answers: 3, skips: 3, firstSeenDaysAgo: 13 })).toBe(false);
    expect(shouldHideStale({ answers: 0, skips: 0, firstSeenDaysAgo: 30 })).toBe(false);
  });
});
