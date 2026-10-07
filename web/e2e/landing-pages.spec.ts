import { expect, type Page, test } from "@playwright/test";
import { boxOf, expectPageFits } from "./page-fit";

// The phone layout: five snap pages under 760px (src/lib/landing/pages.ts). Every test here runs
// in the desktop Playwright project with a phone's viewport; the container query that decides
// the layout reads the page's own width, so this is the same code path as a real phone.

const PHONE = {
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
} as const;
const SMALL = {
  viewport: { width: 360, height: 640 },
  isMobile: true,
  hasTouch: true,
} as const;

/** Scroll to phone page `index` (0 is the hero) and wait until it is the one on screen. */
async function toPage(page: Page, index: number) {
  await page.evaluate((i) => window.scrollTo(0, i * window.innerHeight), index);
  await expect.poll(() => page.evaluate(() => Math.round(window.scrollY / window.innerHeight))).toBe(index);
}

/** Safe-area insets as an installed app gets them (the browser excludes its own bars); Chromium only. */
async function emulateInsets(page: Page, top: number, bottom: number) {
  const cdp = await page.context().newCDPSession(page);
  // The protocol's own types do not list this command yet.
  await cdp.send("Emulation.setSafeAreaInsetsOverride" as Parameters<typeof cdp.send>[0], { insets: { top, bottom } });
}

test.describe("the pager and snapping, on a phone", () => {
  test.use(PHONE);

  test("five dots on the right edge, hidden from screen readers, and the page snaps", async ({ page }) => {
    await page.goto("/");
    const pager = page.locator('[data-landing="pager"]');
    await expect(pager).toBeVisible();
    await expect(pager).toHaveAttribute("aria-hidden", "true");
    await expect(pager.locator("li")).toHaveCount(5);
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).scrollSnapType)).toContain("y mandatory");
    const box = await pager.boundingBox();
    if (!box) throw new Error("pager has no layout box");
    expect(box.x + box.width).toBeGreaterThan(390 - 24);
  });
});

test.describe("the pager and snapping, on desktop", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("there is no pager and nothing snaps", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('[data-landing="pager"]')).toBeHidden();
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).scrollSnapType)).toBe("none");
  });
});

for (const [label, use] of [
  ["390x844", PHONE],
  ["360x640", SMALL],
] as const) {
  test.describe(`page one, ${label}`, () => {
    test.use(use);

    test("is one screen: logo-only nav, headline, Ren at least 160px, both buttons, consent and the dev note, nothing clipped", async ({
      page,
    }) => {
      await page.goto("/");
      await expectPageFits(page, "hero");
      const nav = page.locator("header").first();
      await expect(nav).toContainText("90x");
      await expect(nav.getByRole("button")).toBeHidden(); // the Google button is already on the hero
      await expect(nav.getByRole("link")).toBeHidden(); // and "How it works" is desktop only
      const ren = page.locator('canvas[data-landing="ren"]');
      await expect(ren).toBeAttached();
      // Until Ren's code has sized it, the canvas is the browser's default 300x150; wait for the real size.
      await expect.poll(async () => (await boxOf(ren)).height).toBeGreaterThanOrEqual(160);
      expect((await boxOf(ren)).width).toBeGreaterThanOrEqual(160);
      const hero = page.locator('[data-landing="hero"]');
      for (const locator of [
        hero.getByRole("link", { name: "Try a card, no sign-in" }),
        hero.locator('[data-cta="hero"]'),
        hero.locator('[data-landing="consent"]'),
        hero.locator('[data-landing="dev-note"]'),
      ]) {
        await expect(locator).toBeVisible();
        const b = await boxOf(locator);
        expect(b.y + b.height).toBeLessThanOrEqual(use.viewport.height);
      }
      // No pill, no scroll hint: the dev note is a plain line, in the order the mock has it.
      await expect(page.getByRole("button", { name: /Scroll to see Ren work/ })).toBeHidden();
      const note = hero.locator('[data-landing="dev-note"]');
      expect(await note.evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe("0px");
      expect(await note.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
      const consent = await boxOf(hero.locator('[data-landing="consent"]'));
      const noteBox = await boxOf(note);
      expect(noteBox.y).toBeGreaterThanOrEqual(consent.y + consent.height);
    });

    test("the dot for page one is the lit one", async ({ page }) => {
      await page.goto("/");
      const dots = page.locator('[data-landing="pager"] li');
      await expect(dots).toHaveCount(5);
      await expect(dots.first()).toHaveAttribute("data-on", "");
      await expect(page.locator('[data-landing="pager"] li[data-on]')).toHaveCount(1);
    });

    test("the headline is three lines at most, in every phrase", async ({ page }) => {
      await page.clock.install();
      await page.goto("/");
      const h1 = page.getByRole("heading", { level: 1 });
      const lineHeight = await h1.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight));
      const heights = new Set<number>();
      for (let elapsed = 0; elapsed <= 3 * 3400 + 300; elapsed += 300) {
        heights.add((await boxOf(h1)).height);
        await page.clock.runFor(300);
      }
      expect([...heights]).toHaveLength(1);
      expect([...heights][0] ?? Infinity).toBeLessThanOrEqual(lineHeight * 3.2);
    });
  });
}

test.describe("page one under an iPhone's status bar and home bar", () => {
  test.use(PHONE);

  test("starts below the status bar and is still exactly one screen", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "the inset is emulated through Chrome's DevTools protocol");
    await emulateInsets(page, 59, 34);
    await page.goto("/");
    await expectPageFits(page, "hero");
    const logo = await boxOf(page.locator("header").first().locator("span").first());
    expect(logo.y).toBeGreaterThanOrEqual(59);
  });
});

test.describe("page one, on desktop", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("keeps the nav's text link and Sign in, the scroll hint, and the pill", async ({ page }) => {
    await page.goto("/");
    const nav = page.locator("header").first();
    await expect(nav.getByRole("link", { name: "How it works" })).toBeVisible();
    await expect(nav.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Scroll to see Ren work/ })).toBeVisible();
    expect(await page.locator('[data-landing="dev-note"]').evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe("1px");
  });
});

// The approved mock: the first line never wraps at any width, and on the two-column layout it may run into the
// gap but never into Ren's column. Reduced motion shows the still headline (the rotating area holds two lines).
for (const width of [1280, 1000, 800]) {
  test.describe(`the desktop headline, ${width}px`, () => {
    test.use({ viewport: { width, height: 800 }, reducedMotion: "reduce" });

    test("is three lines, the first stays out of Ren's column and the page does not scroll sideways", async ({ page }) => {
      await page.goto("/");
      const m = await page.getByRole("heading", { level: 1 }).evaluate((h1) => {
        const lead = h1.querySelectorAll("span")[1];
        const stage = document.querySelector('[data-landing="ren-stage"]');
        if (!lead || !stage) throw new Error("the hero's markup changed");
        const text = document.createRange();
        text.selectNodeContents(lead);
        return {
          lines: h1.getBoundingClientRect().height / parseFloat(getComputedStyle(h1).lineHeight),
          leadRight: text.getBoundingClientRect().right,
          renLeft: stage.getBoundingClientRect().left,
          renTop: stage.getBoundingClientRect().top,
          h1Bottom: h1.getBoundingClientRect().bottom,
          pageWidth: document.documentElement.scrollWidth,
          windowWidth: window.innerWidth,
        };
      });
      expect(Math.round(m.lines), "the headline is not three lines").toBe(3);
      if (m.renTop < m.h1Bottom) expect(m.leadRight, "the first line runs into Ren's column").toBeLessThan(m.renLeft);
      else expect(m.leadRight, "the first line runs past the screen's gutter").toBeLessThanOrEqual(m.windowWidth - 20);
      expect(m.pageWidth, "the page scrolls sideways").toBeLessThanOrEqual(m.windowWidth);
    });
  });
}

test.describe("page two, the demo, on a phone", () => {
  test.use(PHONE);

  test("exactly one demo is laid out: the phone one", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('[data-landing="demo"]')).toBeHidden();
    await expect(page.locator('[data-landing="demo-phone"]')).toBeVisible();
    await expect(page.getByRole("heading", { name: "Watch Ren mark a card." })).toBeVisible();
  });

  test("taps, marks and books a card on a timer, then loops with the other outcome", async ({ page }) => {
    await page.clock.install();
    await page.goto("/");
    await toPage(page, 1);
    const section = page.locator('[data-landing="demo-phone"]');
    await expect(section).toHaveAttribute("data-running", "true");
    // Leaving the page stops it: a page that is sliding away is not one that is arriving.
    await toPage(page, 2);
    await expect(section).toHaveAttribute("data-running", "false");
    await toPage(page, 1);
    await expect(section).toHaveAttribute("data-running", "true");
    const card = page.locator('[data-landing="demo-phone-card"]');
    // The verdict row is in the DOM from the start; "shown" means opaque, which is what a person sees.
    const verdict = page.locator('[data-landing="demo-phone-verdict"]');
    const steps = section.locator("ol li");
    await expect(steps).toHaveCount(3);
    await expect(steps.nth(0)).toHaveAttribute("aria-current", "step");
    await expect(card).toHaveAttribute("data-step", "0");
    await expect(verdict).toHaveCSS("opacity", "0");
    await page.clock.runFor(4000);
    await expect(card).toHaveAttribute("data-step", "1");
    await expect(steps.nth(1)).toHaveAttribute("aria-current", "step");
    await expect(verdict).toHaveCSS("opacity", "1");
    await expect(verdict).toHaveText("Correct · in 30 days");
    await page.clock.runFor(4000);
    await expect(card).toHaveAttribute("data-step", "2");
    await expect(card).toContainText("Next review booked · day 30");
    await page.clock.runFor(4000);
    await expect(card).toHaveAttribute("data-step", "0");
    await expect(card).toHaveAttribute("data-outcome", "wrong");
    await expect(verdict).toHaveCSS("opacity", "0");
    await page.clock.runFor(4000);
    await expect(verdict).toHaveCSS("opacity", "1");
    await expect(verdict).toHaveText("Not quite · back tomorrow");
  });

  test("the progress strip sits above the card", async ({ page }) => {
    await page.goto("/");
    const strip = await boxOf(page.locator('[data-landing="demo-phone"] ol'));
    const card = await boxOf(page.locator('[data-landing="demo-phone-card"]'));
    expect(strip.y + strip.height).toBeLessThanOrEqual(card.y);
  });
});

for (const [label, use] of [
  ["390x844", PHONE],
  ["360x640", SMALL],
] as const) {
  test.describe(`page two fits, ${label}`, () => {
    test.use(use);
    test("one screen, nothing clipped, no sideways scroll, in every step", async ({ page }) => {
      await page.clock.install();
      await page.goto("/");
      await toPage(page, 1);
      for (let step = 0; step < 6; step++) {
        await expectPageFits(page, "demo");
        await page.clock.runFor(4000);
      }
    });
  });
}

test.describe("page two with reduced motion, on a phone", () => {
  test.use({ ...PHONE, reducedMotion: "reduce" });

  test("shows the finished card and full segments and never moves", async ({ page }) => {
    await page.clock.install();
    await page.goto("/");
    await toPage(page, 1);
    const card = page.locator('[data-landing="demo-phone-card"]');
    await expect(card).toHaveAttribute("data-step", "2");
    await expect(card).toHaveAttribute("data-outcome", "right");
    await expect(page.locator('[data-landing="demo-phone-verdict"]')).toHaveCSS("opacity", "1");
    await page.clock.runFor(12_000);
    await expect(card).toHaveAttribute("data-step", "2");
    await expect(page.locator('[data-landing="demo-phone"] ol li[aria-current]')).toHaveCount(0);
    await expect(page.locator("[data-hidden]")).toHaveCount(0);
  });
});

test.describe("the desktop demo is untouched", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("only the pinned demo is laid out", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('[data-landing="demo-phone"]')).toBeHidden();
    await expect(page.locator('[data-landing="demo"]')).toBeAttached();
    await expect(page.getByRole("heading", { name: "Watch Ren mark a card." })).toBeHidden();
  });
});

test.describe("page three, the cards, on a phone", () => {
  test.use(PHONE);

  test("one column of cards that drifts, whose second set is hidden from screen readers", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('[data-landing="feed"]')).toBeHidden();
    await toPage(page, 2);
    await expect(
      page.getByRole("heading", {
        name: "Ten kinds of card. Every one marked.",
      }),
    ).toBeVisible();
    const wall = page.locator('[data-landing="cards-wall"]');
    await expect(wall.locator("[data-wall-column]")).toHaveCount(1);
    await expect(wall.locator('[data-wall-column] > [aria-hidden="true"]')).toHaveCount(1);
    const column = wall.locator("[data-wall-column]");
    await expect.poll(() => column.evaluate((el) => (el as HTMLElement).style.transform)).toContain("translateY");
    const first = await column.evaluate((el) => (el as HTMLElement).style.transform);
    await expect.poll(() => column.evaluate((el) => (el as HTMLElement).style.transform)).not.toBe(first);
    await expect(wall).not.toContainText("%");
  });

  test("the wall has a column of one: the cards are as wide as the screen's content", async ({ page }) => {
    await page.goto("/");
    await toPage(page, 2);
    const card = await boxOf(page.locator('[data-landing="cards-wall"] [data-wall-column] > div > div').first());
    expect(card.x).toBeGreaterThanOrEqual(15);
    expect(card.x + card.width).toBeLessThanOrEqual(390 - 15);
  });
});

for (const [label, use] of [
  ["390x844", PHONE],
  ["360x640", SMALL],
] as const) {
  test.describe(`page three fits, ${label}`, () => {
    test.use(use);
    test("one screen, nothing clipped, no sideways scroll", async ({ page }) => {
      await page.goto("/");
      await toPage(page, 2);
      await expectPageFits(page, "cards");
    });
  });
}

test.describe("page three with reduced motion, on a phone", () => {
  test.use({ ...PHONE, reducedMotion: "reduce" });

  test("the column does not move", async ({ page }) => {
    await page.goto("/");
    await toPage(page, 2);
    await page.waitForTimeout(600);
    expect(await page.locator('[data-landing="cards-wall"] [data-wall-column]').evaluate((el) => (el as HTMLElement).style.transform)).toBe(
      "",
    );
  });
});

test.describe("page four, how a day works, on a phone", () => {
  test.use(PHONE);

  test("the three steps, then the four true numbers as tiles, with the desktop strips not laid out", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('[data-landing="how"]')).toBeHidden();
    await expect(page.locator('[data-landing="proof"]')).toBeHidden();
    await toPage(page, 3);
    const how = page.locator('[data-landing="how-phone"]');
    await expect(how.getByRole("heading", { name: "How a day works." })).toBeVisible();
    await expect(how.getByRole("listitem").filter({ hasText: "Today picks your missions." })).toBeVisible();
    await expect(how.getByRole("listitem").filter({ hasText: "You answer and get graded." })).toBeVisible();
    await expect(how.getByRole("listitem").filter({ hasText: "Readiness moves." })).toBeVisible();
    const tiles = how.locator("dl > div");
    await expect(tiles).toHaveCount(4);
    await expect(how.locator("dl")).toContainText("3,693");
    await expect(how.locator("dl")).toContainText("273");
    await expect(how.locator("dl")).toContainText("44");
    await expect(how.locator("dl")).toContainText("MIT");
    await expect(how.getByRole("link", { name: "Code on GitHub" })).toBeVisible();
    // Two by two.
    const [a, b, c] = await Promise.all([boxOf(tiles.nth(0)), boxOf(tiles.nth(1)), boxOf(tiles.nth(2))]);
    expect(Math.abs(a.y - b.y)).toBeLessThan(2);
    expect(c.y).toBeGreaterThan(a.y + a.height - 1);
  });
});

for (const [label, use] of [
  ["390x844", PHONE],
  ["360x640", SMALL],
] as const) {
  test.describe(`page four fits, ${label}`, () => {
    test.use(use);

    test("one screen, nothing clipped, no sideways scroll", async ({ page }) => {
      await page.goto("/");
      await toPage(page, 3);
      await expectPageFits(page, "how");
    });

    test("the steps are centred between the title and the tiles", async ({ page }) => {
      await page.goto("/");
      await toPage(page, 3);
      const how = page.locator('[data-landing="how-phone"]');
      const [title, steps, tiles] = await Promise.all([boxOf(how.locator("h2")), boxOf(how.locator("ol")), boxOf(how.locator("dl"))]);
      const above = steps.y - (title.y + title.height);
      const below = tiles.y - (steps.y + steps.height);
      expect(Math.abs(above - below)).toBeLessThan(4);
    });
  });
}

// The pager sits on the right edge and must never cover text on any phone page.
for (const [label, use] of [
  ["390x844", PHONE],
  ["360x640", SMALL],
] as const) {
  test.describe(`the pager clears the text, ${label}`, () => {
    test.use(use);
    for (const [index, id] of ["hero", "demo", "cards", "how", "close"].entries()) {
      test(`page ${index + 1}`, async ({ page }) => {
        await page.goto("/");
        await toPage(page, index);
        const pager = await boxOf(page.locator('[data-landing="pager"]'));
        const hits = await page.locator(`[data-page="${id}"]`).evaluate((section, p) => {
          const out: string[] = [];
          for (const el of section.querySelectorAll("h1, h2, h3, p, li, dt, dd, a")) {
            const r = el.getBoundingClientRect();
            const across = r.left < p.x + p.width && r.right > p.x && r.top < p.y + p.height && r.bottom > p.y;
            if (r.width > 0 && r.height > 0 && across) out.push(`${el.tagName} "${(el.textContent ?? "").slice(0, 30)}" right ${r.right}`);
          }
          return out;
        }, pager);
        expect(hits, "text under the pager").toEqual([]);
      });
    }
  });
}

test.describe("page five, the close, on a phone", () => {
  test.use(PHONE);

  test("the wordmark's group, both buttons, the consent line and the footer links", async ({ page }) => {
    await page.goto("/");
    await toPage(page, 4);
    const close = page.locator('[data-landing="close"]');
    await expect(close.getByRole("heading", { name: "Day 1 starts with a card." })).toBeVisible();
    await expect(close.getByText("Backend interview prep. Five areas, one plan.")).toBeVisible();
    await expect(close.getByRole("link", { name: "Try a card, no sign-in" })).toBeVisible();
    await expect(close.locator('[data-cta="close"]')).toBeVisible();
    await expect(close.locator('[data-landing="consent"]')).toContainText("By continuing you agree to the Terms and Privacy Policy.");
    const footer = close.getByRole("contentinfo");
    await expect(footer).toHaveCount(1);
    const links = footer.getByRole("navigation", { name: "Footer links" });
    await expect(links.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
    await expect(links.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
    await expect(links.getByRole("link", { name: "Delete account" })).toHaveAttribute("href", "/delete-account");
    await expect(links.getByRole("link", { name: "Source on GitHub" })).toHaveAttribute("href", "https://github.com/Am4nn/90x");
    await expect(footer.getByText("support@mail.90x.amanarya.com")).toHaveCount(0);
    // The page's own footer would be a sixth thing below the five, and a second landmark.
    await expect(page.locator('[data-landing="root"] > footer')).toBeHidden();
    await expect(page.getByRole("contentinfo")).toHaveCount(1);
  });

  test("the heading sits above the buttons, centred", async ({ page }) => {
    await page.goto("/");
    await toPage(page, 4);
    const h = await boxOf(page.locator('[data-landing="close"] h2'));
    const cta = await boxOf(page.locator('[data-landing="close"] [data-cta="close"]'));
    expect(h.y + h.height).toBeLessThan(cta.y);
    expect(Math.abs(h.x + h.width / 2 - 195)).toBeLessThan(20);
  });
});

for (const [label, use] of [
  ["390x844", PHONE],
  ["360x640", SMALL],
] as const) {
  test.describe(`page five fits, ${label}`, () => {
    test.use(use);
    test("one screen, nothing clipped, no sideways scroll", async ({ page }) => {
      await page.goto("/");
      await toPage(page, 4);
      await expectPageFits(page, "close");
    });
  });
}

/** The wordmark's canvas, read back: how many bright pixels it has and the box they fill, in CSS pixels from the page's left and from the close section's top. */
function readWordmark(page: Page) {
  return page.locator('canvas[data-landing="wordmark"]').evaluate((canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const scale = canvas.width / canvas.clientWidth;
    let count = 0;
    let [left, top, right, bottom] = [width, height, 0, 0];
    for (let i = 0; i < data.length; i += 4) {
      // Letter dots are INK or the cyan x; the field's own dots are far dimmer.
      if ((data[i + 3] ?? 0) < 128 || (data[i] ?? 0) + (data[i + 1] ?? 0) + (data[i + 2] ?? 0) < 450) continue;
      const px = (i / 4) % width;
      const py = Math.floor(i / 4 / width);
      count++;
      [left, top, right, bottom] = [Math.min(left, px), Math.min(top, py), Math.max(right, px), Math.max(bottom, py)];
    }
    return { count, left: left / scale, top: top / scale, right: right / scale, bottom: bottom / scale };
  });
}

/** How far the wordmark's glitch (dot-wordmark.ts) may move a letter dot sideways, in CSS pixels. The canvas publishes its own constants; the spec does not retype them. */
async function glitchReach(page: Page) {
  const reach = await page.locator('canvas[data-landing="wordmark"]').evaluate((canvas: HTMLCanvasElement) => ({
    left: Number(canvas.dataset.glitchLeft) * Number(canvas.dataset.step),
    right: Number(canvas.dataset.glitchRight) * Number(canvas.dataset.step),
  }));
  expect(reach.left, "the canvas publishes the glitch's reach").toBeGreaterThan(0);
  expect(reach.right).toBeGreaterThan(0);
  return reach;
}

/** The pixels that are lit outside `area` (viewport pixels, inflated by 2 for anti-aliasing and, on the wordmark's canvas, sideways by the glitch's reach), on the overlay's canvas and on the wordmark's, and the field glow the wordmark's canvas must never show. */
function strays(page: Page, area: { left: number; right: number; top: number; bottom: number }, reach: { left: number; right: number }) {
  return page.evaluate(
    ([a, reachLeft, reachRight]) => {
      const read = (selector: string) => {
        const canvas = document.querySelector<HTMLCanvasElement>(selector);
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) throw new Error(`no canvas ${selector}`);
        const { data, width } = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const scale = canvas.width / canvas.clientWidth;
        const origin = canvas.getBoundingClientRect();
        /** Whether the pixel at byte offset `i` is outside the box, allowing `left` / `right` extra pixels sideways. */
        const outsideArea = (i: number, left = 0, right = 0) => {
          const x = ((i / 4) % width) / scale + origin.left;
          const y = Math.floor(i / 4 / width) / scale + origin.top;
          return x < a.left - 2 - left || x > a.right + 2 + right || y < a.top - 2 || y > a.bottom + 2;
        };
        return { data, outsideArea };
      };
      // The overlay's canvas is empty once the wordmark has taken over: any pixel with any alpha outside the box counts.
      const overlay = read('canvas[data-landing="particles"]');
      let particles = 0;
      for (let i = 3; i < overlay.data.length; i += 4) if ((overlay.data[i] ?? 0) > 0 && overlay.outsideArea(i - 3)) particles++;
      // The wordmark's canvas has the dim field dots everywhere (#151920) and the letters inside the box. Anything brighter than the field outside the box is a stray; sideways, the box is widened by the glitch's reach, because the wordmark's 140ms glitch shifts whole rows of letter dots by design, but nothing may sit beyond that; the field's lit-up shades (#1C2029 ... #5A6272) are the glow, wherever it is.
      const mark = read('canvas[data-landing="wordmark"]');
      const glowShades = [
        [0x1c, 0x20, 0x29],
        [0x2a, 0x30, 0x3c],
        [0x3e, 0x45, 0x53],
        [0x5a, 0x62, 0x72],
      ];
      let outside = 0;
      let glow = 0;
      for (let i = 0; i < mark.data.length; i += 4) {
        const [r, g, b, alpha] = [mark.data[i] ?? 0, mark.data[i + 1] ?? 0, mark.data[i + 2] ?? 0, mark.data[i + 3] ?? 0];
        if (alpha < 128) continue;
        if (r + g + b > 90 && mark.outsideArea(i, reachLeft, reachRight)) outside++;
        if (glowShades.some(([gr = 0, gg = 0, gb = 0]) => Math.abs(r - gr) <= 3 && Math.abs(g - gg) <= 3 && Math.abs(b - gb) <= 3)) glow++;
      }
      return { particles, outside, glow };
    },
    [area, reach.left, reach.right] as const,
  );
}

test.describe("page five's wordmark, with motion on, on a phone", () => {
  test.use(PHONE);

  test("forms in full, centred on its placeholder, with no stray fragment anywhere on the page", async ({ page, browser }) => {
    // The finished wordmark, as reduced motion draws it once, is the measure of "in full".
    const still = await browser.newContext({ ...PHONE, reducedMotion: "reduce" });
    const stillPage = await still.newPage();
    await stillPage.goto("/");
    await toPage(stillPage, 4);
    await expect.poll(async () => (await readWordmark(stillPage)).count).toBeGreaterThan(500);
    const full = await readWordmark(stillPage);
    await still.close();

    await page.goto("/");
    await toPage(page, 4);
    // The overlay loads lazily; it says when it owns the letters ("story") and when it has handed them to the wordmark ("wordmark").
    // The glitch moves some rows for a moment, so the count is polled.
    await expect(page.locator('canvas[data-landing="particles"]')).toHaveAttribute("data-state", "wordmark", { timeout: 20_000 });
    await expect.poll(async () => (await readWordmark(page)).count / full.count, { timeout: 15_000 }).toBeGreaterThan(0.93);
    const mark = await readWordmark(page);
    expect(mark.count / full.count).toBeLessThan(1.07);

    // Centred on the placeholder, and inside it. (Viewport pixels: page five is scrolled to the top of the screen.)
    const box = await page.locator('[data-landing="mark-box"]').evaluate((el) => {
      const section = el.closest('[data-landing="close"]')?.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      if (!section) throw new Error("no close section");
      return {
        left: r.left,
        right: r.right,
        top: r.top,
        bottom: r.bottom,
        inSection: { top: r.top - section.top, bottom: r.bottom - section.top },
      };
    });
    // (The glitch shifts rows sideways for 140ms, which moves the box the letters fill; so the centring is polled.)
    await expect
      .poll(async () => {
        const m = await readWordmark(page);
        return Math.abs((m.left + m.right) / 2 - (box.left + box.right) / 2);
      })
      .toBeLessThan(10);
    expect(mark.top).toBeGreaterThanOrEqual(box.inSection.top - 4);
    expect(mark.bottom).toBeLessThanOrEqual(box.inSection.bottom + 4);

    // Nothing else, at any moment of the next five and a half seconds (sideways, nothing beyond the finished letters' own extent, widened by the glitch's reach; the box itself is the whole screen's width on a phone): no particle on the overlay, no lit pixel beside the wordmark, no field glow.
    // The glitch lasts 140ms of every 5.2s, so the sampling covers a whole period and a bit.
    const reach = await glitchReach(page);
    let worst = { particles: 0, outside: 0, glow: 0 };
    const until = Date.now() + 5600;
    while (Date.now() < until) {
      const now = await strays(page, { ...box, left: full.left, right: full.right }, reach);
      worst = {
        particles: Math.max(worst.particles, now.particles),
        outside: Math.max(worst.outside, now.outside),
        glow: Math.max(worst.glow, now.glow),
      };
      await page.waitForTimeout(30);
    }
    expect(worst, "pixels lit outside the wordmark's box, or field glow (the most seen)").toEqual({ particles: 0, outside: 0, glow: 0 });
  });
});

const DUPLICATES = () => {
  const ids = [...document.querySelectorAll("[id]")].map((el) => el.id);
  return ids.filter((id, i) => ids.indexOf(id) !== i);
};
const SECTION_ORDER = () =>
  [...document.querySelectorAll<HTMLElement>("main > section")]
    .filter((s) => getComputedStyle(s).display !== "none")
    .map((s) => s.dataset.landing);

test.describe("the whole phone layout", () => {
  test.use(PHONE);

  test("five pages in order, with the pager following the scroll", async ({ page }) => {
    await page.goto("/");
    expect(await page.evaluate(SECTION_ORDER)).toEqual(["hero", "demo-phone", "cards", "how-phone", "close"]);
    for (let index = 0; index < 5; index++) {
      await toPage(page, index);
      const dots = page.locator('[data-landing="pager"] li');
      for (let dot = 0; dot < 5; dot++) {
        if (dot === index) await expect(dots.nth(dot)).toHaveAttribute("data-on", "");
        else await expect(dots.nth(dot)).not.toHaveAttribute("data-on", "");
      }
    }
  });

  test("no id appears twice in the page, although three sections exist in two layouts", async ({ page }) => {
    await page.goto("/");
    expect(await page.evaluate(DUPLICATES)).toEqual([]);
  });

  test("every Google button has the consent line in the same page", async ({ page }) => {
    await page.goto("/");
    for (const spot of ["hero", "close"]) {
      const section = page.locator(`[data-cta="${spot}"]`).locator("xpath=ancestor::section[1]");
      await expect(section.locator('[data-landing="consent"]')).toContainText("By continuing you agree to the Terms and Privacy Policy.");
    }
  });
});

test.describe("the whole long layout", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("six sections in order, none of the phone's pages laid out, no duplicate ids", async ({ page }) => {
    await page.goto("/");
    expect(await page.evaluate(SECTION_ORDER)).toEqual(["hero", "demo", "proof", "feed", "how", "close"]);
    expect(await page.evaluate(DUPLICATES)).toEqual([]);
    for (const hidden of ["demo-phone", "cards", "how-phone"]) await expect(page.locator(`[data-landing="${hidden}"]`)).toBeHidden();
  });
});

// Realistic devices only: the insets an installed app gets, and none for a browser tab.
for (const { label, width, height, top, bottom } of [
  { label: "390x844, notched iPhone installed (59/34)", width: 390, height: 844, top: 59, bottom: 34 },
  { label: "375x667, iPhone SE installed (20/0)", width: 375, height: 667, top: 20, bottom: 0 },
  { label: "360x640, small Android in the browser (0/0)", width: 360, height: 640, top: 0, bottom: 0 },
  { label: "360x740, Android installed (24/0)", width: 360, height: 740, top: 24, bottom: 0 },
]) {
  test.describe(`every page fits, ${label}`, () => {
    test.use({ viewport: { width, height }, isMobile: true, hasTouch: true });

    // The hero's notices (a sign-in that did not complete, a deleted account) take room the plain page does not need.
    for (const [what, url] of [
      ["", "/"],
      [" with the sign-in-failed notice", "/?error=1"],
      [" with the account-deleted notice", "/?deleted=1"],
    ] as const) {
      test(`one screen each, nothing clipped, no sideways scroll${what}`, async ({ page, browserName }) => {
        test.skip(browserName !== "chromium", "the inset is emulated through Chrome's DevTools protocol");
        await emulateInsets(page, top, bottom);
        await page.clock.install();
        await page.goto(url);
        if (what) await expect(page.locator('[data-landing="hero"] [data-landing="notice"]')).toBeVisible();
        for (const [index, id] of ["hero", "demo", "cards", "how", "close"].entries()) {
          await toPage(page, index);
          await expectPageFits(page, id);
          await page.clock.runFor(4000);
        }
        if (what) {
          await toPage(page, 0);
          const hero = page.locator('[data-landing="hero"]');
          expect((await boxOf(page.locator('canvas[data-landing="ren"]'))).height).toBeGreaterThanOrEqual(160);
          for (const locator of [
            hero.locator('[data-cta="hero"]'),
            hero.locator('[data-landing="consent"]'),
            hero.locator('[data-landing="notice"]'),
          ]) {
            const b = await boxOf(locator);
            expect(b.y + b.height).toBeLessThanOrEqual(height);
          }
        }
      });
    }
  });
}

// Reduced motion shows every reveal finished. Only after hydration is that true (before it the HTML hides them on purpose:
// `data-pending` is on every Reveal until the page's script has run), so wait for that first, and look at both layouts.
for (const [label, viewport] of [
  ["390x844", PHONE.viewport],
  ["1280x800", { width: 1280, height: 800 }],
] as const) {
  test.describe(`reduced motion, ${label}`, () => {
    test.use({ ...(viewport.width < 760 ? PHONE : {}), viewport, reducedMotion: "reduce" });

    test("once hydrated, nothing is left hidden behind a reveal", async ({ page }) => {
      await page.goto("/");
      expect(await page.locator(".landing-reveal").count(), "the page has reveals to check").toBeGreaterThan(0);
      await expect(page.locator("[data-pending]")).toHaveCount(0);
      await expect(page.locator("[data-hidden]")).toHaveCount(0);
    });
  });
}

test.describe("the whole phone layout with reduced motion", () => {
  test.use({ ...PHONE, reducedMotion: "reduce" });

  test("the demo is finished and every page still fits", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("[data-pending]")).toHaveCount(0);
    await expect(page.locator('[data-landing="demo-phone-card"]')).toHaveAttribute("data-step", "2");
    for (let index = 0; index < 5; index++) {
      await toPage(page, index);
      await expectPageFits(page, ["hero", "demo", "cards", "how", "close"][index] ?? "");
    }
  });
});
