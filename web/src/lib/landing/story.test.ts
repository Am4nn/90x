import { describe, expect, it } from "vitest";
import { type StoryLayout, storyAnchors, storyValue } from "./story";

// A page as the 1280 by 800 desktop lays it out: a hero, a 2560px demo pinned in a screen,
// the wall, and the close, in a 5200px page.
const layout: StoryLayout = {
  demoTop: 800,
  demoHeight: 2560,
  wallTop: 3500,
  closeTop: 4400,
  wordmarkHeight: 340,
  pageHeight: 5200,
  viewport: 800,
};

describe("storyAnchors", () => {
  const a = storyAnchors(layout);

  it("puts each leg where the sections are", () => {
    expect(a.heroEnd).toBe(800);
    // The demo lets go when its end reaches the bottom of the window.
    expect(a.demoEnd).toBe(800 + 2560 - 800);
    // The wall is 35% of the way up the screen.
    expect(a.wallStart).toBe(Math.max(a.demoEnd + 240, 3500 - 280));
    expect(a.wallEnd).toBe(4400 - 720);
    expect(a.closeEnd).toBe(Math.max(a.wallEnd + 320, 4400 + 170 - 400));
  });

  it("is in order", () => {
    expect(a.heroEnd).toBeLessThan(a.demoEnd);
    expect(a.demoEnd).toBeLessThan(a.wallStart);
    expect(a.wallStart).toBeLessThan(a.wallEnd);
    expect(a.wallEnd).toBeLessThan(a.closeEnd);
  });

  it("never asks for more scroll than the page has, so the wordmark always finishes forming", () => {
    const short = storyAnchors({ ...layout, pageHeight: 4900 });
    expect(short.closeEnd).toBe(4900 - 800 - 4);
    expect(short.wallEnd).toBeLessThanOrEqual(short.closeEnd - 280);
  });

  it("copes with a page that has no demo or wall yet", () => {
    const bare = storyAnchors({ ...layout, demoTop: null, demoHeight: 0, wallTop: null });
    expect(bare.heroEnd).toBe(400);
    expect(bare.demoEnd).toBe(401);
    expect(Number.isFinite(bare.wallStart)).toBe(true);
  });
});

describe("storyValue", () => {
  const a = storyAnchors(layout);

  it("runs 0 to 1 over the hero, holds through the demo, 1 to 2 to the wall, holds, 2 to 3 to the close", () => {
    expect(storyValue(0, a)).toBe(0);
    expect(storyValue(-50, a)).toBe(0);
    expect(storyValue(400, a)).toBeCloseTo(0.5);
    expect(storyValue(a.heroEnd, a)).toBe(1);
    expect(storyValue((a.heroEnd + a.demoEnd) / 2, a)).toBe(1);
    expect(storyValue((a.demoEnd + a.wallStart) / 2, a)).toBeCloseTo(1.5);
    expect(storyValue((a.wallStart + a.wallEnd) / 2, a)).toBe(2);
    expect(storyValue((a.wallEnd + a.closeEnd) / 2, a)).toBeCloseTo(2.5);
    expect(storyValue(a.closeEnd, a)).toBe(3);
    expect(storyValue(99999, a)).toBe(3);
  });

  it("never goes backwards as the page scrolls forwards", () => {
    let last = -1;
    for (let y = 0; y <= 5200; y += 25) {
      const v = storyValue(y, a);
      expect(v).toBeGreaterThanOrEqual(last);
      last = v;
    }
  });
});
