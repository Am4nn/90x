import { describe, expect, it } from "vitest";
import { focusRange, lengthError } from "./campaign-rules";

describe("lengthError", () => {
  it("allows any length that still includes today", () => {
    expect(lengthError("2026-09-01", "2026-09-27", 30)).toBeNull(); // day 27 of 30
    expect(lengthError("2026-09-01", "2026-09-27", 27)).toBeNull();
  });

  it("refuses to end the campaign before today", () => {
    expect(lengthError("2026-09-01", "2026-09-27", 26)).toMatch(/at least 27/);
  });

  it("keeps lengths in range", () => {
    expect(lengthError("2026-09-27", "2026-09-27", 6)).toMatch(/7/);
    expect(lengthError("2026-09-27", "2026-09-27", 366)).toMatch(/365/);
  });
});

describe("focusRange", () => {
  it("runs from today for whole weeks", () => {
    expect(focusRange("2026-09-27", 1)).toEqual({ from: "2026-09-27", to: "2026-10-03" });
    expect(focusRange("2026-09-27", 2)).toEqual({ from: "2026-09-27", to: "2026-10-10" });
  });
});
