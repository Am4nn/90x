// The story value: where the particles are in their journey, as one number from 0 to 3,
// worked out from how far the page has scrolled.
//
//   0 -> 1  the hero: Ren breaks into particles as the page starts to scroll
//   1       held while the demo is pinned
//   1 -> 2  the particles leave the demo and arrive at the Feed wall
//   2       held while the wall is read
//   2 -> 3  the particles fly to the "90x" at the close and settle into it

export interface StoryLayout {
  /** Where each section starts, in pixels from the top of the page. */
  demoTop: number | null;
  demoHeight: number;
  wallTop: number | null;
  closeTop: number;
  /** How tall the wordmark's own space is at the top of the close section. */
  wordmarkHeight: number;
  pageHeight: number;
  viewport: number;
}

/** Scroll positions, in pixels, where each leg of the journey starts and ends. */
export interface StoryAnchors {
  /** The story value is 1 from here (the demo reaches the top of the screen)... */
  heroEnd: number;
  /** ...until here, where the demo lets go. */
  demoEnd: number;
  /** It reaches 2 here, with the Feed wall 35% up the screen... */
  wallStart: number;
  /** ...stays there until here, then climbs to 3... */
  wallEnd: number;
  /** ...and arrives here. */
  closeEnd: number;
}

/** The scroll positions the story value is pinned to. The last is held to the end of the page, so the wordmark always finishes forming. */
export function storyAnchors(layout: StoryLayout): StoryAnchors {
  const { viewport, closeTop } = layout;
  const heroEnd = Math.max(60, layout.demoTop ?? viewport * 0.5);
  const demoEnd = Math.max(heroEnd + 1, layout.demoTop === null ? heroEnd : layout.demoTop + layout.demoHeight - viewport);
  const wallStart = Math.max(demoEnd + viewport * 0.3, layout.wallTop === null ? 0 : layout.wallTop - viewport * 0.35);
  let wallEnd = Math.max(wallStart, closeTop - viewport * 0.9);
  let closeEnd = Math.max(wallEnd + viewport * 0.4, closeTop + layout.wordmarkHeight / 2 - viewport * 0.5);
  const maxScroll = layout.pageHeight - viewport - 4;
  if (closeEnd > maxScroll) {
    closeEnd = maxScroll;
    wallEnd = Math.min(wallEnd, closeEnd - viewport * 0.35);
  }
  return { heroEnd, demoEnd, wallStart, wallEnd, closeEnd };
}

/** The story value at scroll position `y`. */
export function storyValue(y: number, a: StoryAnchors): number {
  if (y <= 0) return 0;
  if (y < a.heroEnd) return y / a.heroEnd;
  if (y < a.demoEnd) return 1;
  if (y < a.wallStart) return 1 + (y - a.demoEnd) / (a.wallStart - a.demoEnd);
  if (y < a.wallEnd) return 2;
  if (y < a.closeEnd) return 2 + (y - a.wallEnd) / (a.closeEnd - a.wallEnd);
  return 3;
}
