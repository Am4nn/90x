import { describe, expect, it } from "vitest";
import { nextState, stretchCorrect } from "@/lib/feed/srs";
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
const NOW = new Date("2026-10-05T12:00:00Z");

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
    expect(at(1)).toEqual([1, 20]);
  });

  it("is finished at 1: marked, booked, every day lit", () => {
    expect(demoView(1)).toEqual({ stage: 2, picked: true, marked: true, lit: [1, 20] });
  });
});

describe("the copy", () => {
  it("has three steps and a caption for each", () => {
    expect(DEMO_STEPS).toHaveLength(3);
    expect(DEMO_CAPTIONS).toHaveLength(3);
    expect(DEMO_CAPTIONS[2]).toBe("Back tomorrow if missed, in a month if right.");
  });

  it("answers with Backoff with jitter, one of four choices", () => {
    expect(DEMO_CHOICES).toHaveLength(4);
    expect(DEMO_CHOICES[DEMO_ANSWER]).toBe("Backoff with jitter");
  });

  it("is the mock's strip, 21 squares labelled Today, +1, +30, with tomorrow and the last square lit", () => {
    expect(REVIEW_STRIP.squares).toBe(21);
    expect(REVIEW_STRIP.labels).toEqual(["Today", "+1", "+30"]);
    expect(REVIEW_STRIP.days).toEqual([1, REVIEW_STRIP.squares - 1]);
  });

  it("matches the Feed's scheduler: a first miss is due in 1 day, a fully right answer at least 30 days on", () => {
    expect(REVIEW_STRIP.daysAhead).toEqual([1, 30]);
    const days = (dueAt: Date) => (dueAt.getTime() - NOW.getTime()) / 86_400_000;
    expect(days(nextState(null, 1, NOW).dueAt)).toBe(1);
    const right = stretchCorrect(nextState(null, 4, NOW), { rating: 4, now: NOW, retire: false });
    expect(days(right.dueAt)).toBeGreaterThanOrEqual(30);
  });

  it("keeps the percentage to the card's one score: none in the steps, captions, choices or strip labels", () => {
    const text = [...DEMO_STEPS, ...DEMO_CAPTIONS, ...DEMO_CHOICES, ...REVIEW_STRIP.labels];
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
