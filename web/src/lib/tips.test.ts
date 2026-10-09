import { describe, expect, it } from "vitest";
import { ALL_SEEN, DEMO, DEMO_CAP, demoSteps } from "./tips";

describe("demoSteps", () => {
  it("shows every step, in order, to an account that has seen none", () => {
    expect(demoSteps([]).map((s) => s.id)).toEqual(["plan-me", "audio"]);
  });

  it("leaves out the steps already seen", () => {
    expect(demoSteps(["plan-me"]).map((s) => s.id)).toEqual(["audio"]);
    expect(demoSteps(["plan-me", "audio"])).toEqual([]);
  });

  it("ignores ids it doesn't know", () => {
    expect(demoSteps(["old-step"]).map((s) => s.id)).toEqual(["plan-me", "audio"]);
  });

  it("never shows more than the cap", () => {
    expect(DEMO.length).toBeLessThanOrEqual(DEMO_CAP);
  });

  it("shows nothing when every step counts as seen (Today's fallback when its read fails)", () => {
    expect(demoSteps(ALL_SEEN)).toEqual([]);
    expect(ALL_SEEN.toSorted()).toEqual(DEMO.map((s) => s.id).toSorted());
  });
});
