import { describe, expect, it } from "vitest";
import { reviewWhen, shapeReviewRow, verdictOf } from "./review-list-rules";

describe("verdictOf", () => {
  it("maps the stored boolean to a label and tone", () => {
    expect(verdictOf(true)).toEqual({ label: "Correct", tone: "ok" });
    expect(verdictOf(false)).toEqual({ label: "Wrong", tone: "bad" });
    expect(verdictOf(null)).toEqual({ label: "Reviewed", tone: "neutral" });
  });
});

describe("reviewWhen", () => {
  it("says Today for a review written today in the reader's timezone", () => {
    expect(reviewWhen("2026-10-10T18:40:00Z", "2026-10-11", "Asia/Kolkata")).toBe("Today");
  });
  it("reads the database's timestamp shape", () => {
    expect(reviewWhen("2026-10-10 18:40:00.12+00", "2026-10-10", "UTC")).toBe("Today");
  });
  it("uses the short date otherwise", () => {
    expect(reviewWhen("2026-10-06T08:00:00Z", "2026-10-11", "UTC")).toBe("Oct 6");
  });
});

describe("shapeReviewRow", () => {
  const base = { id: "r1", correct: null as boolean | null };
  it("takes time from complexity.yours.time", () => {
    expect(shapeReviewRow({ ...base, complexity: { yours: { time: "O(n)", space: "O(1)" } } })).toEqual({ ...base, time: "O(n)" });
  });
  it("gives null time for an empty or missing complexity, and keeps a null verdict", () => {
    expect(shapeReviewRow({ ...base, complexity: {} }).time).toBeNull();
    expect(shapeReviewRow({ ...base, complexity: null }).time).toBeNull();
    expect(shapeReviewRow({ ...base, complexity: { yours: { time: 5 } } }).time).toBeNull();
    expect(shapeReviewRow({ ...base, complexity: {} }).correct).toBeNull();
  });
});
