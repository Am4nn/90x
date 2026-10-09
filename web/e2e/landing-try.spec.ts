import { expect, type Page, test } from "@playwright/test";
import { TRY_CARDS, TRY_COPY, TRY_CTA, TRY_LESSON } from "../src/lib/landing/try-cards";
import { signIn } from "./helpers";

// /try: three cards answered in the browser, no sign-in, no network (src/app/try/page.tsx).

// The tab order is System design, DSA, SQL.
const [SD, DSA] = TRY_CARDS as [(typeof TRY_CARDS)[number], (typeof TRY_CARDS)[number]];
const SOURCE_COOKIE = "x90_src"; // lib/analytics/source.ts

const option = (page: Page, i: number) => page.locator("[data-try-option]").nth(i);
// The pinned bar on a phone; the sign-in card under the lesson on a wide screen.
const bar = (page: Page) => page.locator('[data-try="bar"], [data-try="signin"]');
const wrong = (card: (typeof TRY_CARDS)[number]) => (card.correct + 1) % 4;

/**
 * The bar button's label text against the button's content box (its rect less its padding): how far the text is from
 * each edge. Negative means it spills into the padding or past the button. (`whitespace-nowrap` keeps it on one line,
 * so a line count cannot fail; this can.)
 */
async function labelClearance(page: Page): Promise<{ left: number; right: number; lines: number }> {
  return bar(page)
    .locator('[data-cta="try"]')
    .evaluate((button) => {
      const box = button.getBoundingClientRect();
      const style = getComputedStyle(button);
      const contentLeft = box.left + parseFloat(style.paddingLeft);
      const contentRight = box.right - parseFloat(style.paddingRight);
      const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
      let left = Infinity;
      let right = -Infinity;
      const tops = new Set<number>();
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const rect of range.getClientRects()) {
          if (rect.width === 0) continue;
          left = Math.min(left, rect.left);
          right = Math.max(right, rect.right);
          tops.add(Math.round(rect.top));
        }
      }
      return {
        left: left - contentLeft,
        right: contentRight - right,
        lines: tops.size,
      };
    });
}

test("the page: back link, Sign in, title, three tabs in order, the footnote, System design open", async ({ page }) => {
  await page.goto("/try");
  await expect(page).toHaveTitle(/Try a backend interview card/);
  await expect(page.getByRole("link", { name: "Back to 90x home" })).toHaveAttribute("href", "/");
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Try a card.");
  await expect(page.getByText(TRY_COPY.lede)).toBeVisible();
  const tabs = page.getByRole("tab");
  await expect(tabs).toHaveCount(3);
  await expect(tabs.nth(0)).toContainText("System design");
  await expect(tabs.nth(1)).toContainText("DSA");
  await expect(tabs.nth(2)).toContainText("SQL");
  await expect(tabs.nth(0)).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: TRY_LESSON.title })).toBeVisible(); // the desktop column
  await expect(page.getByText(SD.prompt)).toBeVisible();
  await expect(bar(page)).toHaveCount(0);
  // No particles, no smooth-scroll library, no landing root.
  await expect(page.locator('[data-landing="root"], canvas')).toHaveCount(0);
  await expect(page.locator("html")).not.toHaveClass(/lenis/);
  // A page-level openGraph must not drop the root link-card image.
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /opengraph-image/);
  await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute("content", /twitter-image|opengraph-image/);
});

test("a right answer: the verdict, the answer and key point, then the pinned bar with the Google button, the consent line and the next card", async ({
  page,
}) => {
  await page.goto("/try");
  await option(page, SD.correct).click();
  await expect(page.locator("#try-verdict")).toContainText("Correct");
  await expect(page.locator("#try-verdict")).toContainText("In your plan, this comes back in 30 days.");
  await expect(page.getByText(SD.keyPoint)).toBeVisible();
  await expect(option(page, SD.correct)).toContainText("Correct");
  await expect(bar(page)).toBeVisible();
  await expect(bar(page).locator('[data-cta="try"]')).toHaveText(TRY_CTA);
  await expect(bar(page).locator('[data-landing="consent"]')).toContainText("By continuing you agree to the Terms and Privacy Policy.");
  await expect(page.locator("#try-panel").getByRole("button", { name: "Next card: DSA" })).toBeVisible();
  // The verdict sits below the rows.
  const verdictBox = await page.locator("#try-verdict").boundingBox();
  const lastRow = await option(page, 3).boundingBox();
  expect(verdictBox?.y ?? 0).toBeGreaterThan(lastRow?.y ?? Infinity);
  // Pinned on a phone: still at the bottom of the screen. (On a wide screen the sign-in card sits under the lesson.)
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("no viewport");
  if (viewport.width < 768) {
    // Polled: the bar slides in over 0.35s.
    await expect
      .poll(async () => {
        const b = await bar(page).boundingBox();
        return b ? Math.round(b.y + b.height) : -1;
      })
      .toBe(viewport.height);
  }
});

test("a wrong answer says Not quite, as the Feed does, and marks both rows in words", async ({ page }) => {
  await page.goto("/try");
  await option(page, wrong(SD)).click();
  await expect(page.locator("#try-verdict")).toContainText("Not quite");
  await expect(page.locator("#try-verdict")).not.toContainText("point missed");
  await expect(page.locator("#try-verdict")).toContainText("In your plan, this comes back tomorrow.");
  await expect(option(page, wrong(SD))).toContainText("You chose");
  await expect(option(page, SD.correct)).toContainText("Correct");
  // A second click after answering changes nothing (dispatched, as Playwright will not click an aria-disabled button; force would hide a bar covering it).
  await option(page, SD.correct).dispatchEvent("click");
  await expect(page.locator("#try-verdict")).toContainText("Not quite");
  await expect(option(page, wrong(SD))).toContainText("You chose");
});

test("answering sends only the event beacon, nothing to Supabase", async ({ page }) => {
  const calls: string[] = [];
  const kinds: string[] = [];
  // A route sees a beacon's body reliably (the request event can lose it once the beacon has finished).
  await page.route("**/api/try/event", (route) => {
    kinds.push(JSON.parse(route.request().postData() ?? "{}").kind);
    return route.fulfill({ status: 204 });
  });
  page.on("request", (request) => {
    const url = request.url();
    if (
      (!url.includes("/_next/") && /\/auth\/v1|\/rest\/v1|supabase/i.test(url)) ||
      (/\/api\//.test(url) && !url.endsWith("/api/try/event"))
    )
      calls.push(url);
  });
  await page.goto("/try");
  await page.waitForLoadState("networkidle");
  for (let i = 0; i < 3; i++) {
    await page.getByRole("tab").nth(i).click();
    await option(page, 0).click();
  }
  await expect(bar(page)).toBeVisible();
  await expect.poll(() => kinds.filter((k) => k === "answer").length).toBe(3);
  expect(kinds.filter((k) => k === "view")).toHaveLength(1);
  expect(calls).toEqual([]);
});

/** Collects the event beacons (kind and data); a route sees a beacon's body reliably. */
async function beacons(page: Page) {
  const events: { kind: string; data?: Record<string, unknown> }[] = [];
  await page.route("**/api/try/event", (route) => {
    events.push(JSON.parse(route.request().postData() ?? "{}"));
    return route.fulfill({ status: 204 });
  });
  return events;
}

test("a tab change sends tab with its slug, and a sign-in click sends signin_click with its spot", async ({ page }) => {
  const events = await beacons(page);
  await page.route("**/auth/v1/authorize**", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "<title>stub</title>" }),
  );
  await page.goto("/try");
  await page.getByRole("tab").nth(1).click();
  await expect.poll(() => events.find((e) => e.kind === "tab")?.data).toEqual({ tab: "dsa" });
  await option(page, 0).click();
  await bar(page).locator('[data-cta="try"]').click();
  await expect.poll(() => events.find((e) => e.kind === "signin_click")?.data).toEqual({ spot: "try" });
});

test("leaving by the back link sends leave with how far the visit got", async ({ page }) => {
  const events = await beacons(page);
  await page.goto("/try");
  await option(page, 0).click();
  await page.getByRole("link", { name: "Back to 90x home" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect.poll(() => events.find((e) => e.kind === "leave")?.data).toEqual({ seconds: "0-10", step: "answered" });
  expect(events.filter((e) => e.kind === "leave")).toHaveLength(1);
});

test("Continue with Google in the bar starts the same Google sign-in", async ({ page }) => {
  await page.route("**/auth/v1/authorize**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<title>stub</title>",
    }),
  );
  await page.goto("/try");
  await option(page, 0).click();
  const authorize = page.waitForRequest(/\/auth\/v1\/authorize/);
  await bar(page).locator('[data-cta="try"]').click();
  expect(new URL((await authorize).url()).searchParams.get("provider")).toBe("google");
});

test("Sign in at the top starts it too", async ({ page }) => {
  await page.route("**/auth/v1/authorize**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<title>stub</title>",
    }),
  );
  await page.goto("/try");
  const authorize = page.waitForRequest(/\/auth\/v1\/authorize/);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  expect(new URL((await authorize).url()).searchParams.get("provider")).toBe("google");
});

/**
 * Makes the sign-in fail in the page the way an unreachable Google does for the person: the client throws before it
 * can start the redirect. (Aborting the authorize request does not do it: the redirect is a navigation, not a fetch,
 * so the page would never learn of it.) The sign-in stores its PKCE verifier in a cookie first; a cookie jar that
 * refuses writes makes that step throw.
 */
async function breakSignIn(page: Page) {
  await page.evaluate(() => {
    Object.defineProperty(Document.prototype, "cookie", {
      configurable: true,
      get: () => "",
      set: () => {
        throw new Error("cookies are blocked");
      },
    });
  });
}

test("when Google cannot be reached the person is told, from the top button and from the bar", async ({ page }) => {
  await page.goto("/try");
  await breakSignIn(page);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("Couldn't reach Google sign-in. Try again in a moment.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
  await page.reload();
  await option(page, 0).click();
  await breakSignIn(page);
  await bar(page).locator('[data-cta="try"]').click();
  await expect(bar(page).getByText("Couldn't reach Google sign-in. Try again in a moment.")).toBeVisible();
  await expect(bar(page).locator('[data-cta="try"]')).toBeEnabled();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
});

test("a signed-in visitor never sees it: /try goes to Today, like /", async ({ page }) => {
  await signIn(page, "try-home");
  await page.goto("/try");
  await expect(page).toHaveURL("/today");
});

test("a campaign link to /try keeps the source cookie the proxy sets", async ({ page, context }) => {
  await page.goto("/try?utm_source=linkedin&utm_medium=post");
  expect((await context.cookies()).some((c) => c.name === SOURCE_COOKIE)).toBe(true);
});

test("tabs follow the arrow keys, Home and End; each card keeps its own answer; the bar stays across tabs", async ({ page }) => {
  await page.goto("/try");
  await option(page, SD.correct).click();
  const sd = page.getByRole("tab").nth(0);
  await sd.focus();
  await page.keyboard.press("ArrowRight");
  const dsa = page.getByRole("tab").nth(1);
  await expect(dsa).toBeFocused();
  await expect(dsa).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText(DSA.prompt)).toBeVisible();
  await expect(page.locator("#try-verdict")).toBeEmpty(); // this card is unanswered
  await expect(bar(page)).toBeVisible(); // but the bar stays
  await expect(page.locator("#try-panel").getByRole("button", { name: /Next card/ })).toHaveCount(0); // the footer is for an answered card
  await page.keyboard.press("End");
  await expect(page.getByRole("tab").nth(2)).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(sd).toBeFocused();
  await expect(page.getByRole("tab").nth(2)).toHaveAttribute("tabindex", "-1");
  // Back on the first card, the answer is still there, and its tab says so.
  await expect(page.locator("#try-verdict")).toContainText("Correct");
  await expect(sd.getByRole("img", { name: "answered correctly" })).toBeVisible();
  await expect(page.locator("#try-panel").getByRole("button", { name: "Next card: DSA" })).toBeVisible();
});

test("Next card follows the tab order and wraps; Pick again clears only this card", async ({ page }) => {
  await page.goto("/try");
  await option(page, 0).click();
  const panel = page.locator("#try-panel");
  await panel.getByRole("button", { name: "Next card: DSA" }).click();
  await expect(page.getByText(DSA.prompt)).toBeVisible();
  await option(page, 1).click();
  await panel.getByRole("button", { name: "Next card: SQL" }).click();
  await option(page, 1).click();
  // All three are answered: the footer says so, and goes to the lesson (its heading takes focus on a wide screen).
  await panel.getByRole("button", { name: "Hear the lesson" }).click();
  await expect(page.getByRole("heading", { name: TRY_LESSON.title })).toBeFocused();
  await page.getByRole("tab").nth(0).click();
  await expect(page.getByText(SD.prompt)).toBeVisible();
  await page.getByRole("button", { name: "Pick again" }).click();
  await expect(page.locator("#try-verdict")).toBeEmpty();
  await expect(option(page, 0)).toBeFocused(); // the button that had focus is gone; focus lands on the options
  await expect(bar(page)).toBeVisible(); // DSA is still answered
  await page.getByRole("tab").nth(1).click();
  await page.getByRole("button", { name: "Pick again" }).click();
  await expect(bar(page)).toBeVisible(); // SQL is still answered
  await page.getByRole("tab").nth(2).click();
  await page.getByRole("button", { name: "Pick again" }).click();
  await expect(bar(page)).toHaveCount(0); // the last answer is gone, and the bar with it
});

test("options keep focus after an answer, and the verdict is announced from a live region that was there before", async ({ page }) => {
  await page.goto("/try");
  const live = page.locator('#try-verdict[aria-live="polite"]');
  await expect(live).toHaveCount(1);
  await expect(live).toBeEmpty();
  await option(page, 2).focus();
  await page.keyboard.press("Enter");
  await expect(option(page, 2)).toBeFocused();
  await expect(option(page, 2)).toHaveAttribute("aria-disabled", "true");
  await expect(live).toContainText(/Correct|Not quite/);
  await page.keyboard.press("Tab");
  await expect(option(page, 3)).toBeFocused();
});

test("the SQL and DSA cards show their code, which scrolls inside its block", async ({ page }) => {
  await page.goto("/try");
  await page.getByRole("tab").nth(1).click();
  await expect(page.locator("pre")).toContainText("std::unordered_set<char> seen;");
  await page.getByRole("tab").nth(2).click();
  await expect(page.locator("pre")).toContainText("-- which join goes here?");
  await expect(option(page, 1)).toContainText("AND o.year = 2026");
});

for (const [width, height] of [
  [360, 640],
  [390, 844],
] as const) {
  test.describe(`at ${width}x${height}: the verdict is not under the sticky bar`, () => {
    test.use({ viewport: { width, height }, isMobile: true, hasTouch: true });

    test("the DSA card's long lines scroll inside the code block, which shades its hidden edge; the page does not scroll sideways", async ({
      page,
    }) => {
      await page.goto("/try");
      await page.getByRole("tab").nth(1).click();
      const pre = page.locator("pre");
      await expect(pre).toContainText("std::unordered_set<char> seen;");
      const box = await pre.evaluate((el) => {
        const style = getComputedStyle(el);
        return {
          overflow: style.overflowX,
          attach: style.backgroundAttachment,
          scroll: el.scrollWidth,
          client: el.clientWidth,
        };
      });
      expect(box.overflow).toBe("auto");
      expect(box.scroll).toBeGreaterThan(box.client);
      expect(box.attach).toContain("local");
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await pre.evaluate((el) => el.scrollTo({ left: el.scrollWidth }));
      await expect.poll(() => pre.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
    });

    test("after an answer, the verdict's top edge is at or below the header's bottom edge; the error notice does not cover the card", async ({
      page,
    }) => {
      await page.goto("/try");
      await option(page, wrong(SD)).click();
      // The smooth scroll settles.
      await expect
        .poll(async () => {
          const v = await page.locator("#try-verdict").boundingBox();
          const h = await page.locator("header").first().boundingBox();
          return v && h ? Math.round(v.y - (h.y + h.height)) : -999;
        })
        .toBeGreaterThanOrEqual(0);
      // "Not quite" sits on one line beside its mark, even at 360.
      const headline = page.locator("#try-verdict").getByText("Not quite", { exact: true });
      expect(await headline.evaluate((el) => el.getClientRects().length)).toBe(1);
      // With the sign-in notice showing in the bar, the end of the content is still above the bar.
      await breakSignIn(page);
      await bar(page).locator('[data-cta="try"]').click();
      await expect(bar(page).getByRole("alert")).toBeVisible();
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await expect
        .poll(async () => {
          const panel = await page.locator("#try-panel").boundingBox();
          const b = await bar(page).boundingBox();
          return panel && b ? Math.round(b.y - (panel.y + panel.height)) : -999;
        })
        .toBeGreaterThanOrEqual(0);
    });
  });
}

for (const width of [360, 390]) {
  test.describe(`at ${width}px`, () => {
    test.use({
      viewport: { width, height: 780 },
      isMobile: true,
      hasTouch: true,
    });

    test("every card answered: no sideways scroll, options at least 48px, the code scrolls in its block, the bar's label is one line", async ({
      page,
    }) => {
      await page.goto("/try");
      for (const [i, card] of TRY_CARDS.entries()) {
        await page.getByRole("tab").nth(i).click();
        for (let o = 0; o < 4; o++) expect((await option(page, o).boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(48);
        await option(page, card.correct).click();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), card.key).toBe(
          true,
        );
        const fit = await labelClearance(page);
        expect(fit.lines, `${card.key}: the label stays on one line`).toBe(1);
        expect(fit.left, `${card.key}: clearance left of the label`).toBeGreaterThanOrEqual(4);
        expect(fit.right, `${card.key}: clearance right of the label`).toBeGreaterThanOrEqual(4);
        const next = await page
          .locator("#try-panel")
          .getByRole("button", { name: /Next card|Hear the lesson/ })
          .boundingBox();
        expect(next).not.toBeNull();
      }
      await page.getByRole("tab").nth(1).click();
      expect(await page.locator("pre").evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
      // Phone labels.
      await expect(page.getByRole("tab").nth(0)).toContainText("Design");
      await expect(page.getByRole("tab", { name: /Listen/ })).toBeVisible();
      // The top bar is sticky on a phone.
      await page.evaluate(() => window.scrollTo(0, 600));
      expect((await page.locator("header").first().boundingBox())?.y).toBe(0);
    });
  });
}

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("the verdict and the bar appear without animation", async ({ page }) => {
    await page.goto("/try");
    await option(page, 1).click();
    await expect(page.locator("#try-verdict")).toContainText(/Correct|Not quite/);
    expect(await page.locator("#try-verdict").evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
  });
});

test("the head: its own title and description, a canonical link, an image, and indexable", async ({ page }) => {
  await page.goto("/try");
  await expect(page).toHaveTitle("Try a backend interview card, no sign-in · 90x");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /system design caching question.*SQL join question/);
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0); // not noindex: it is the page that should be found
  await expect(page.locator('meta[property="og:image"]')).toHaveCount(1);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/try$/);
});

test("exactly one lesson block on a wide screen", async ({ page }) => {
  await page.goto("/try");
  await expect(page.locator("#try-lesson-title")).toHaveCount(1);
  await expect(page.getByRole("button", { name: /the lesson, with audio/ })).toHaveCount(0);
  await page.getByRole("tab").nth(1).click();
  await expect(page.locator("#try-lesson-title")).toHaveCount(1);
});

test.describe("on a phone (390x844) @mobile", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });

  test("the listen row opens the Listen tab; one lesson block; the bar appears from the first play", async ({ page }) => {
    // The demo route answers with the e2e tone (try-listen.spec.ts covers its other answers).
    await page.route("**/api/audio/demo", (route) =>
      route.fulfill({
        json: {
          slug: TRY_LESSON.slug,
          url: "/e2e/tone.mp3",
          durationS: 6,
          lines: [],
        },
      }),
    );
    await page.goto("/try");
    await expect(page.locator("#try-lesson-title")).toHaveCount(0);
    await page.getByRole("button", { name: /the lesson, with audio/ }).click();
    await expect(page.getByRole("tab", { name: /Listen/ })).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#try-lesson-title")).toHaveCount(1);
    await expect(page.locator("#try-lesson-title")).toBeVisible();
    await expect(bar(page)).toHaveCount(0);
    await page.getByRole("button", { name: /^Listen, / }).click();
    await expect(bar(page)).toBeVisible(); // nothing answered, the bar shows from the play
    const viewport = page.viewportSize();
    await expect
      .poll(async () => {
        const b = await bar(page).boundingBox();
        return b ? Math.round(b.y + b.height) : -1;
      })
      .toBe(viewport?.height);
  });

  test("short footer labels, and Hear the lesson after three answers selects Listen", async ({ page }) => {
    await page.goto("/try");
    const panel = page.locator("#try-panel");
    await page.getByRole("tab").nth(2).click();
    await option(page, 0).click();
    await expect(panel.getByRole("button", { name: "Next card: Design" })).toBeVisible();
    await panel.getByRole("button", { name: "Next card: Design" }).click();
    await option(page, 0).click();
    await expect(panel.getByRole("button", { name: "Next card: DSA" })).toBeVisible();
    await panel.getByRole("button", { name: "Next card: DSA" }).click();
    await option(page, 0).click();
    await panel.getByRole("button", { name: "Hear the lesson" }).click();
    await expect(page.getByRole("tab", { name: /Listen/ })).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#try-lesson-title")).toHaveCount(1);
  });

  test.describe("with reduced motion", () => {
    test.use({ reducedMotion: "reduce" });
    test("the pinned bar appears without animation", async ({ page }) => {
      await page.goto("/try");
      await option(page, 1).click();
      await expect(bar(page)).toBeVisible();
      expect(await bar(page).evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
    });
  });
});
