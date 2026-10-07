import { describe, expect, it } from "vitest";
import { HOW_STEPS, HOW_SUB, HOW_TITLE } from "./how";

describe("How a day works", () => {
  it("has three steps in the design's order, one sentence each", () => {
    expect(HOW_TITLE).toBe("How a day works.");
    expect(HOW_SUB).toBe("Your day's work, planned for you.");
    expect(HOW_STEPS.map((s) => s.title)).toEqual(["Today picks your missions.", "You answer and get graded.", "Readiness moves."]);
    expect(HOW_STEPS.map((s) => s.icon)).toEqual(["plan", "grade", "readiness"]);
    for (const step of HOW_STEPS) expect(step.text.match(/\./g), step.text).toHaveLength(1);
  });

  it("has no numbers and no promised length of time", () => {
    for (const step of HOW_STEPS) {
      expect(`${step.title} ${step.text}`).not.toMatch(/\d|minute|hour/i);
    }
  });
});
