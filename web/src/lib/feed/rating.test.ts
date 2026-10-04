import { describe, expect, it } from "vitest";
import { isStars, nextRating, ratingBand, ratingLabel } from "./rating";

describe("rating", () => {
  it("reads 1-2 as bad, 3 as normal and 4-5 as good", () => {
    expect([1, 2, 3, 4, 5].map(ratingBand)).toEqual(["bad", "bad", "normal", "good", "good"]);
  });

  it("accepts only whole numbers from one to five", () => {
    expect([0, 1, 5, 6, 2.5, "3", null, NaN].map(isStars)).toEqual([false, true, true, false, false, false, false, false]);
  });

  it("labels the hovered star first, then the chosen one, then the prompt", () => {
    expect(ratingLabel(null, null)).toBe("Rate this card");
    expect(ratingLabel(4, null)).toBe("Good");
    expect(ratingLabel(4, 1)).toBe("Poor");
    expect(ratingLabel(null, 5)).toBe("Excellent");
  });

  it("clears the rating when the chosen star is tapped again", () => {
    expect(nextRating(3, 3)).toBeNull();
    expect(nextRating(3, 5)).toBe(5);
    expect(nextRating(null, 2)).toBe(2);
  });
});
