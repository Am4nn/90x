// The phone layout: five sections of exactly one screen, snapping vertically. This is the
// pure part, tested on its own: which pages there are, where the phone layout starts, which
// page the scroll position is on, and what the particles hold on each page.

export const PAGE_IDS = ["hero", "demo", "cards", "how", "close"] as const;

/** The landing root's width under which the phone layout applies. Must equal `--container-wide` in globals.css (the `@wide:` / `@max-wide:` variants). */
export const NARROW_PX = 760;
export const isNarrow = (rootWidth: number): boolean => rootWidth < NARROW_PX;

const clampIndex = (index: number): number => Math.max(0, Math.min(PAGE_IDS.length - 1, index));

/** The page nearest the scroll position, when every page is `pageHeight` tall. Snapping lands on exact multiples; mid-swipe the nearest page wins. */
export function pageIndex(scrollY: number, pageHeight: number): number {
  if (!(pageHeight > 0)) return 0;
  return clampIndex(Math.round(scrollY / pageHeight));
}

/**
 * The particles' story value on each page (0 to 3, as `story.ts` numbers it on the long
 * scroll): Ren is whole on the hero (0), the demo card has them (1), the wall has them on the
 * cards page and stays on the how page (2), and the wordmark forms on the close (3).
 */
export const PAGE_STORY = [0, 1, 2, 2, 3] as const;
export const storyForPage = (index: number): number => PAGE_STORY[clampIndex(index)] ?? 0;

/** Which page's box the wall's particles run along: the cards page, and the how page that follows it. */
export const wallPage = (index: number): "cards" | "how" => (index >= 3 ? "how" : "cards");
