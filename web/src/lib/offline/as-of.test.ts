import { describe, expect, it } from "vitest";
import { asOfText } from "./as-of";

describe("asOfText", () => {
  it("shows the time for a copy made today", () => {
    expect(asOfText(new Date(2026, 8, 27, 10, 42), new Date(2026, 8, 27, 18, 0))).toBe("10:42");
    expect(asOfText(new Date(2026, 8, 27, 9, 5), new Date(2026, 8, 27, 9, 30))).toBe("09:05");
  });
  it("adds the day for an older copy", () => {
    expect(asOfText(new Date(2026, 8, 26, 21, 15), new Date(2026, 8, 27, 8, 0))).toBe("Sep 26, 21:15");
  });
});
