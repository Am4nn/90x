import { describe, expect, it } from "vitest";
import { isNarrow, NARROW_PX, PAGE_IDS, PAGE_STORY, pageIndex, storyForPage, wallPage } from "./pages";

describe("the five phone pages", () => {
  it("are hero, demo, cards, how, close, in that order", () => {
    expect([...PAGE_IDS]).toEqual(["hero", "demo", "cards", "how", "close"]);
  });

  it("the phone layout is a root narrower than 760px; 760px is the wide one", () => {
    expect(NARROW_PX).toBe(760);
    expect(isNarrow(359)).toBe(true);
    expect(isNarrow(759.9)).toBe(true);
    expect(isNarrow(760)).toBe(false);
    expect(isNarrow(1280)).toBe(false);
  });
});

describe("pageIndex", () => {
  const H = 844;

  it("is the page nearest the scroll position, so a swipe in flight already counts for the page it is landing on", () => {
    expect(pageIndex(0, H)).toBe(0);
    expect(pageIndex(421, H)).toBe(0);
    expect(pageIndex(422, H)).toBe(1);
    expect(pageIndex(H, H)).toBe(1);
    expect(pageIndex(2 * H, H)).toBe(2);
    expect(pageIndex(3 * H, H)).toBe(3);
    expect(pageIndex(4 * H, H)).toBe(4);
  });

  it("clamps overscroll at both ends (iOS rubber-bands past the page)", () => {
    expect(pageIndex(-60, H)).toBe(0);
    expect(pageIndex(9 * H, H)).toBe(4);
  });

  it("copes with a page height that is not measured yet", () => {
    expect(pageIndex(500, 0)).toBe(0);
    expect(pageIndex(500, Number.NaN)).toBe(0);
  });

  it("is exact for a small screen, where the browser toolbar changes the height by a few percent", () => {
    expect(pageIndex(3 * 640, 640)).toBe(3);
    expect(pageIndex(3 * 640, 640 * 1.08)).toBe(3);
  });
});

describe("what each page holds for the particles", () => {
  it("is Ren, the demo card, the wall, the wall again, then the wordmark", () => {
    expect([...PAGE_STORY]).toEqual([0, 1, 2, 2, 3]);
    expect([0, 1, 2, 3, 4].map(storyForPage)).toEqual([0, 1, 2, 2, 3]);
    expect(storyForPage(-3)).toBe(0);
    expect(storyForPage(12)).toBe(3);
  });

  it("runs the wall's particles along the cards page, then along the how page", () => {
    expect([0, 1, 2, 3, 4].map(wallPage)).toEqual(["cards", "cards", "cards", "how", "how"]);
  });
});
