import { describe, expect, it } from "vitest";
import { difficultyMix, parseDifficulty, parseDifficultyPreference, parseLevel } from "./difficulty";

describe("difficultyMix", () => {
  it("serves a measurably harder mix to a 95% reader than a 50% reader", () => {
    const strong = difficultyMix(0.95, "some_practice", "standard");
    const weak = difficultyMix(0.5, "some_practice", "standard");
    expect(strong.hard).toBeGreaterThan(weak.hard);
    expect(weak.easy).toBeGreaterThan(strong.easy);
  });

  it("falls back to level before any answers: ready is harder than first_time", () => {
    const ready = difficultyMix(null, "ready", "standard");
    const fresh = difficultyMix(null, "first_time", "standard");
    expect(ready.hard).toBeGreaterThan(fresh.hard);
    expect(fresh.easy).toBeGreaterThan(ready.easy);
  });

  it("shifts, never filters: harder raises hard and lowers easy, both stay positive", () => {
    const standard = difficultyMix(null, "some_practice", "standard");
    const harder = difficultyMix(null, "some_practice", "harder");
    const easier = difficultyMix(null, "some_practice", "easier");

    expect(harder.hard).toBeGreaterThan(standard.hard);
    expect(harder.easy).toBeLessThan(standard.easy);
    expect(harder.hard).toBeGreaterThan(0);
    expect(harder.easy).toBeGreaterThan(0);

    expect(easier.easy).toBeGreaterThan(standard.easy);
    expect(easier.hard).toBeLessThan(standard.hard);
    expect(easier.hard).toBeGreaterThan(0);
    expect(easier.easy).toBeGreaterThan(0);
  });

  it("keeps every share in [0, 1] and the mix summing to 1", () => {
    const accuracies = [null, 0, 0.25, 0.5, 0.7, 0.75, 0.85, 0.95, 1];
    const levels = ["first_time", "some_practice", "ready", null] as const;
    const preferences = ["harder", "standard", "easier"] as const;
    for (const accuracy of accuracies) {
      for (const level of levels) {
        for (const preference of preferences) {
          const mix = difficultyMix(accuracy, level, preference);
          expect(mix.easy + mix.medium + mix.hard).toBeCloseTo(1, 9);
          for (const share of [mix.easy, mix.medium, mix.hard]) {
            expect(share).toBeGreaterThanOrEqual(0);
            expect(share).toBeLessThanOrEqual(1);
          }
        }
      }
    }
  });
});

describe("parseDifficulty", () => {
  it("keeps the three labels and nothing else", () => {
    expect(parseDifficulty("Easy")).toBe("Easy");
    expect(parseDifficulty("Medium")).toBe("Medium");
    expect(parseDifficulty("Hard")).toBe("Hard");
    expect(parseDifficulty(null)).toBeNull();
    expect(parseDifficulty("easy")).toBeNull();
    expect(parseDifficulty(3)).toBeNull();
  });
});

describe("parseLevel", () => {
  it("keeps the three levels and nothing else", () => {
    expect(parseLevel("first_time")).toBe("first_time");
    expect(parseLevel("some_practice")).toBe("some_practice");
    expect(parseLevel("ready")).toBe("ready");
    expect(parseLevel(null)).toBeNull();
    expect(parseLevel("expert")).toBeNull();
  });
});

describe("parseDifficultyPreference", () => {
  it("reads the key inside feed_topics and defaults to standard", () => {
    expect(parseDifficultyPreference({ difficulty: "harder", areas: ["dsa"] })).toBe("harder");
    expect(parseDifficultyPreference("easier")).toBe("easier");
    expect(parseDifficultyPreference({ areas: ["dsa"] })).toBe("standard");
    expect(parseDifficultyPreference(null)).toBe("standard");
    expect(parseDifficultyPreference("brutal")).toBe("standard");
  });
});
