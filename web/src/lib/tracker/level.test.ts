import { describe, expect, it } from "vitest";
import { LEVELS, asLevel, difficultyScore } from "./level";

describe("asLevel", () => {
  it("reads the three values the database allows", () => {
    for (const level of LEVELS) expect(asLevel(level.value)).toBe(level.value);
  });

  it("reads null, undefined and anything unrecognised as never asked", () => {
    for (const value of [null, undefined, "", "expert", "READY", "first-time"]) expect(asLevel(value)).toBeNull();
  });
});

describe("difficultyScore", () => {
  it("is zero with no level and at some_practice, so today's order is untouched", () => {
    for (const level of [null, undefined, "some_practice"] as const) {
      for (const difficulty of ["Easy", "Medium", "Hard"]) expect(difficultyScore(level, difficulty)).toBe(0);
    }
  });

  it("prefers Easy, then Medium, for a first-time reader", () => {
    expect(difficultyScore("first_time", "Easy")).toBeGreaterThan(difficultyScore("first_time", "Medium"));
    expect(difficultyScore("first_time", "Medium")).toBeGreaterThan(difficultyScore("first_time", "Hard"));
  });

  it("prefers Hard, then Medium, for someone interview-ready", () => {
    expect(difficultyScore("ready", "Hard")).toBeGreaterThan(difficultyScore("ready", "Medium"));
    expect(difficultyScore("ready", "Medium")).toBeGreaterThan(difficultyScore("ready", "Easy"));
  });

  it("treats an unknown difficulty as the middle, never as a reason to skip a problem", () => {
    expect(difficultyScore("first_time", "Trivial")).toBeGreaterThan(difficultyScore("first_time", "Hard"));
    expect(difficultyScore("ready", "Trivial")).toBeGreaterThan(difficultyScore("ready", "Easy"));
  });
});
