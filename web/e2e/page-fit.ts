import { expect, type Page } from "@playwright/test";

// Shared by the phone-page specs (landing-pages.spec.ts and the later ones). Not a spec file, so importing it
// never registers tests.

/**
 * A phone page is exactly one screen and nothing in it overflows, and the page never scrolls sideways.
 * Written once; every phone page's spec calls it.
 */
export async function expectPageFits(page: Page, id: string) {
  // Fonts and Ren's sizing settle just after load; a measure taken before them can see a page a few pixels too tall.
  await page.evaluate(() => document.fonts.ready);
  const measure = () =>
    page.locator(`[data-page="${id}"]`).evaluate((el) => ({
      client: el.clientHeight,
      scroll: el.scrollHeight,
      screen: window.innerHeight,
      pageWidth: document.documentElement.scrollWidth,
      windowWidth: window.innerWidth,
    }));
  await expect
    .poll(
      async () => {
        const m = await measure();
        return m.scroll - m.client;
      },
      { message: `${id} has content below its screen, by this many pixels` },
    )
    .toBe(0);
  const m = await measure();
  expect(m.scroll, `${id} has content below its screen`).toBe(m.client);
  expect(m.client, `${id} is not one screen tall`).toBe(m.screen);
  expect(m.pageWidth, "the page scrolls sideways").toBeLessThanOrEqual(m.windowWidth);
}

/** The bounding box of an element, or a failure that says it has none. */
export async function boxOf(locator: ReturnType<Page["locator"]>) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("no layout box");
  return box;
}
