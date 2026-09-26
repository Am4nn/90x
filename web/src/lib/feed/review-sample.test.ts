import { describe, expect, it } from "vitest";
import { batchVerdict, PASS_AT, pickReviewSample, SAMPLE_SIZE } from "./review-sample";

// Card c-i has risk i/100, so c-0 is the riskiest.
const cards = (count: number) => Array.from({ length: count }, (_, i) => ({ id: `c-${i}`, risk: i / 100 }));

const verdicts = (good: number, bad: number) => [
  ...Array.from({ length: good }, () => "good" as const),
  ...Array.from({ length: bad }, () => "bad" as const),
];

describe("pickReviewSample", () => {
  it("takes the riskiest half first, then random others", () => {
    const pool = cards(50).toReversed();
    const sample = pickReviewSample(pool, 1);
    expect(sample).toHaveLength(SAMPLE_SIZE);
    expect(sample.slice(0, 10)).toEqual(Array.from({ length: 10 }, (_, i) => `c-${i}`));
    const rest = sample.slice(10);
    expect(new Set(sample).size).toBe(SAMPLE_SIZE);
    expect(rest.every((id) => Number(id.slice(2)) >= 10)).toBe(true);
  });

  it("rounds the risky half up", () => {
    expect(pickReviewSample(cards(50), 1, 5).slice(0, 3)).toEqual(["c-0", "c-1", "c-2"]);
  });

  it("treats a missing risk as safest", () => {
    const pool = [
      { id: "none", risk: null },
      { id: "safe", risk: 0.99 },
      { id: "risky", risk: 0.2 },
      { id: "mid", risk: 0.6 },
    ];
    expect(pickReviewSample(pool, 1, 4).slice(0, 2)).toEqual(["risky", "mid"]);
    expect(pickReviewSample(pool, 1, 6).slice(0, 3)).toEqual(["risky", "mid", "safe"]);
  });

  it("returns every card when there are fewer than the sample size", () => {
    expect(pickReviewSample(cards(7), 3).toSorted()).toEqual(
      cards(7)
        .map((card) => card.id)
        .toSorted(),
    );
  });

  it("never returns a card twice", () => {
    const pool = [...cards(15), ...cards(15)];
    const sample = pickReviewSample(pool, 2);
    expect(sample).toHaveLength(15);
    expect(new Set(sample).size).toBe(15);
  });

  it("is deterministic for a seed and varies across seeds", () => {
    expect(pickReviewSample(cards(80), 4)).toEqual(pickReviewSample(cards(80), 4));
    expect(pickReviewSample(cards(80), 4).slice(10)).not.toEqual(pickReviewSample(cards(80), 5).slice(10));
  });
});

describe("batchVerdict", () => {
  it("is pending until every sampled card has a verdict", () => {
    expect(batchVerdict([])).toBe("pending");
    expect(batchVerdict(verdicts(19, 0))).toBe("pending");
  });

  it("publishes at 18 of 20 good", () => {
    expect(PASS_AT).toBe(18);
    expect(batchVerdict(verdicts(18, 2))).toBe("published");
    expect(batchVerdict(verdicts(17, 3))).toBe("rejected");
  });

  it("scales the pass mark for a smaller batch", () => {
    expect(batchVerdict(verdicts(9, 1), 10)).toBe("published");
    expect(batchVerdict(verdicts(8, 2), 10)).toBe("rejected");
    // ceil(18 × 7 / 20) = 7
    expect(batchVerdict(verdicts(7, 0), 7)).toBe("published");
    expect(batchVerdict(verdicts(6, 1), 7)).toBe("rejected");
  });

  it("an empty batch never publishes", () => {
    expect(batchVerdict([], 0)).toBe("pending");
  });
});
