import { describe, expect, it } from "vitest";
import { DEMO_ANSWER, DEMO_CAPTIONS, DEMO_CHOICES, DEMO_STEPS, demoView, quantize, REVIEW_STRIP, scrollProgress, unquantize } from "./demo";

describe("scrollProgress", () => {
  it("is 0 until the section reaches the top, then runs to 1 over the height it can be pinned for", () => {
    // A 3200px section in an 800px window is pinned for 2400px.
    expect(scrollProgress(500, 3200, 800)).toBe(0);
    expect(scrollProgress(0, 3200, 800)).toBe(0);
    expect(scrollProgress(-1200, 3200, 800)).toBe(0.5);
    expect(scrollProgress(-2400, 3200, 800)).toBe(1);
    expect(scrollProgress(-5000, 3200, 800)).toBe(1);
  });

  it("does not divide by zero when the section is no taller than the window", () => {
    expect(scrollProgress(-10, 800, 800)).toBe(1);
    expect(scrollProgress(0, 800, 800)).toBe(0);
  });
});

const at = (sp: number) => demoView(sp).lit;

describe("demoView", () => {
  it("picks the answer at 20%, marks it at 45% and books it from 68%", () => {
    expect(demoView(0)).toMatchObject({ stage: 0, picked: false, marked: false, lit: [] });
    expect(demoView(0.199).picked).toBe(false);
    expect(demoView(0.2)).toMatchObject({ stage: 0, picked: true, marked: false });
    expect(demoView(0.449).stage).toBe(0);
    expect(demoView(0.45)).toMatchObject({ stage: 1, picked: true, marked: true, lit: [] });
    expect(demoView(0.679).stage).toBe(1);
    expect(demoView(0.68).stage).toBe(2);
  });

  it("lights the booked days one after another, each when its share of the strip has been reached", () => {
    expect(at(0.68)).toEqual([]);
    expect(at(0.72)).toEqual([1]);
    expect(at(0.9)).toEqual([1]);
    expect(at(1)).toEqual([1, 14]);
  });

  it("is finished at 1: marked, booked, every day lit", () => {
    expect(demoView(1)).toEqual({ stage: 2, picked: true, marked: true, lit: [1, 14] });
  });
});

describe("the copy", () => {
  it("has three steps and a caption for each", () => {
    expect(DEMO_STEPS).toHaveLength(3);
    expect(DEMO_CAPTIONS).toHaveLength(3);
    expect(DEMO_CAPTIONS[2]).toBe("Back before you forget.");
  });

  it("answers with Backoff with jitter, one of four choices", () => {
    expect(DEMO_CHOICES).toHaveLength(4);
    expect(DEMO_CHOICES[DEMO_ANSWER]).toBe("Backoff with jitter");
  });

  it("labels the strip Today, +1, +30, each over the square it names, and the last label ends the strip", () => {
    expect(REVIEW_STRIP.labels).toEqual([
      { day: 0, text: "Today" },
      { day: 1, text: "+1" },
      { day: 14, text: "+30" },
    ]);
    expect(REVIEW_STRIP.squares).toBe(15);
    expect(Math.max(...REVIEW_STRIP.days)).toBe(REVIEW_STRIP.squares - 1);
    // The skipped days sit between the labelled squares, and no lit square is among them.
    expect(REVIEW_STRIP.gap).toEqual({ from: 2, to: 13 });
    for (const square of REVIEW_STRIP.days) expect(square < REVIEW_STRIP.gap.from || square > REVIEW_STRIP.gap.to).toBe(true);
  });

  it("matches the Feed's scheduler: a miss returns in 1 day, a right answer 30 days on", () => {
    expect(REVIEW_STRIP.daysAhead).toEqual([1, 30]);
    expect(REVIEW_STRIP.caption).toBe("Wrong answers return tomorrow. Right ones, a month later.");
  });

  it("promises nothing about a score: no percentages anywhere in the demo's text", () => {
    const text = [...DEMO_STEPS, ...DEMO_CAPTIONS, ...DEMO_CHOICES, REVIEW_STRIP.caption, ...REVIEW_STRIP.labels.map((l) => l.text)];
    for (const line of text) expect(line).not.toMatch(/%/);
  });
});

describe("quantize", () => {
  it("rounds to half-percents, so tiny scrolls change nothing", () => {
    expect(quantize(0.2)).toBe(40);
    expect(quantize(0.2001)).toBe(40);
    expect(quantize(1)).toBe(200);
    expect(unquantize(quantize(0.45))).toBeCloseTo(0.45);
  });
});
