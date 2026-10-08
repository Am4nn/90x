import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

// The public front door (src/app/page.tsx), built to the approved design.

const CHAT_ANSWER = "In 4 of your last 6 attempts you shrank the window before checking the condition.";

test("a signed-out visitor sees the page and its sign-in buttons", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL("/");
  // The animated lines are hidden from screen readers; the heading says the whole sentence once.
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    /Backend interview prep that plans your day, checks every answer and remembers what you miss\./,
  );
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  await expect(page.locator('[data-cta="hero"]')).toHaveText("Continue with Google");
  await expect(page.getByText("Google sign-in. Installs on phone and desktop.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Source on GitHub" })).toHaveAttribute("href", "https://github.com/Am4nn/90x");
});

test("Continue with Google starts the Google sign-in, and every button reads Opening Google meanwhile", async ({ page }) => {
  // Hold Supabase's authorize request open until the busy state has been checked; the test
  // never reaches Google.
  const { promise: held, resolve: release } = Promise.withResolvers<void>();
  await page.route("**/auth/v1/authorize**", async (route) => {
    await held;
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<title>stub</title>",
    });
  });
  await page.goto("/");
  const origin = new URL(page.url()).origin;
  const authorize = page.waitForRequest(/\/auth\/v1\/authorize/);
  // Once the click starts the trip to Google, Playwright's locators wait for that (held)
  // navigation, so the buttons are read inside the page, right after the click. The button
  // only works once the page has hydrated: click until it reports busy.
  const clickAndRead = () =>
    page.locator('[data-cta="hero"]').evaluate(async (hero: HTMLButtonElement) => {
      hero.click();
      for (let i = 0; i < 20 && !hero.disabled; i++) await new Promise((r) => setTimeout(r, 25));
      return [...document.querySelectorAll<HTMLButtonElement>("button[data-cta]")].map((b) => ({
        cta: b.dataset.cta,
        text: b.textContent?.trim(),
        disabled: b.disabled,
      }));
    });
  let buttons: Awaited<ReturnType<typeof clickAndRead>> = [];
  await expect(async () => {
    buttons = await clickAndRead();
    expect(buttons.find((b) => b.cta === "hero")?.disabled).toBe(true);
  }).toPass();
  release();

  // Hero and closing buttons share one state; the nav's small button is disabled, not relabelled.
  expect(buttons).toEqual([
    { cta: "nav", text: "Sign in", disabled: true },
    { cta: "hero", text: "Opening Google…", disabled: true },
    { cta: "close", text: "Opening Google…", disabled: true },
  ]);

  const url = new URL((await authorize).url());
  expect(url.searchParams.get("provider")).toBe("google");
  expect(url.searchParams.get("redirect_to")).toBe(`${origin}/auth/callback`);
});

test("the nav button starts the same sign-in", async ({ page }) => {
  await page.route("**/auth/v1/authorize**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<title>stub</title>",
    }),
  );
  await page.goto("/");
  const authorize = page.waitForRequest(/\/auth\/v1\/authorize/);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  expect(new URL((await authorize).url()).searchParams.get("provider")).toBe("google");
});

test("/sign-in is gone: it redirects to the front page and keeps ?error=", async ({ page }) => {
  await page.goto("/sign-in?error=callback");
  await expect(page).toHaveURL("/?error=callback");
  // By text: Next's own route announcer is also an alert.
  await expect(page.getByText("Sign-in didn't complete. Try again.", { exact: true })).toBeVisible();
});

test("a signed-in visitor never sees it: / goes to Today", async ({ page }) => {
  await signIn(page, "landing-home");
  await page.goto("/");
  await expect(page).toHaveURL("/today");
});

test("scrolling the pinned demo answers the card, marks it, then books it to come back", async ({ page }) => {
  await page.goto("/");
  const demo = page.locator('[data-landing="demo"]');
  const scrollTo = (progress: number) =>
    demo.evaluate(
      (section: HTMLElement, p) =>
        window.scrollTo(0, section.getBoundingClientRect().top + window.scrollY + p * (section.offsetHeight - window.innerHeight)),
      progress,
    );
  const verdict = page.locator('[data-landing="demo-verdict"]');
  // A lit square carries the bg-cyan class; the others are bg-surface-2 (and today is outlined).
  const lit = page.locator('[data-landing="demo-day"].bg-cyan');

  await scrollTo(0.3);
  await expect(page.getByText("Ren reads your answer.")).toBeVisible();
  await expect(verdict).toHaveAttribute("aria-hidden", "true");
  await expect(lit).toHaveCount(0);

  await scrollTo(0.55);
  await expect(page.getByText("Marked correct.")).toBeVisible();
  await expect(verdict).toHaveAttribute("aria-hidden", "false");
  // As in the mock, the verdict carries the score.
  await expect(verdict).toHaveText("Correct100%");

  await scrollTo(1);
  await expect(
    page.getByText("Back tomorrow if missed, in a month if right.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(lit).toHaveCount(2);
  // The strip's labels, spread along it as in the mock.
  await expect(page.locator('[data-landing="demo-strip"]')).toContainText("Today+1+30");
});

test("the Feed wall drifts, its second set is hidden from screen readers, and it counts ten kinds", async ({ page }) => {
  await page.goto("/");
  const wall = page.locator('[data-landing="feed-wall"]');
  await wall.scrollIntoViewIfNeeded();
  await expect(page.locator('[data-landing="feed"]').getByText("Ten kinds of card. Every one marked.")).toBeVisible();
  // One hidden copy of the cards per column; three columns at this width.
  await expect(wall.locator('[data-wall-column] > [aria-hidden="true"]')).toHaveCount(3);
  const column = wall.locator("[data-wall-column]").first();
  await expect.poll(() => column.evaluate((el) => (el as HTMLElement).style.transform)).not.toBe("");
  const first = await column.evaluate((el) => (el as HTMLElement).style.transform);
  await expect.poll(() => column.evaluate((el) => (el as HTMLElement).style.transform)).not.toBe(first);
  await expect(wall).not.toContainText("%");
});

test("the Feed wall holds still while the pointer is over it", async ({ page }) => {
  await page.goto("/");
  const wall = page.locator('[data-landing="feed-wall"]');
  await wall.scrollIntoViewIfNeeded();
  const column = wall.locator("[data-wall-column]").first();
  const shift = () => column.evaluate((el) => (el as HTMLElement).style.transform);
  await expect.poll(shift).not.toBe("");
  await wall.hover();
  const held = await shift();
  await page.waitForTimeout(500);
  expect(await shift()).toBe(held);
  await page.mouse.move(0, 0);
  await expect.poll(shift).not.toBe(held);
});

const HEADLINE_VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900, isMobile: false },
  { name: "narrow window", width: 665, height: 900, isMobile: false },
  { name: "phone", width: 390, height: 844, isMobile: true },
];

for (const { name, width, height, isMobile } of HEADLINE_VIEWPORTS) {
  test.describe(`${name}, ${width}px`, () => {
    test.use({ viewport: { width, height }, isMobile, hasTouch: isMobile });
    test("the headline keeps one height through every phrase", async ({ page }) => {
      // The scramble runs off requestAnimationFrame, which the fake clock drives.
      await page.clock.install();
      await page.goto("/");
      const h1 = page.getByRole("heading", { level: 1 });
      await expect(h1).toBeVisible();
      const heights = new Set<number>();
      // Three phrases of PHRASE_MS (6000 ms) each, and a little over, sampled every 200 ms.
      for (let elapsed = 0; elapsed <= 3 * 6000 + 300; elapsed += 200) {
        heights.add((await h1.boundingBox())!.height);
        await page.clock.runFor(200);
      }
      expect([...heights]).toHaveLength(1);
    });
  });
}

test.describe("the headline on desktop", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("holds each phrase, then scrambles only the words that change", async ({ page }) => {
    await page.clock.install();
    await page.goto("/");
    // The live line: runs of landed letters and of noise (drawn muted).
    const parts = () =>
      page
        .locator("h1 span.h-0 > span")
        .evaluateAll((els) => els.map((el) => ({ text: el.textContent ?? "", noise: el.classList.contains("text-mute-3") })));
    // The line counts its own time from hydration, so wait for that, then step the clock as frames would.
    await expect(page.locator("h1 [data-pending]")).toHaveCount(0);
    for (let t = 0; t < 5000; t += 250) await page.clock.runFor(250);
    // Still the first phrase, whole, five seconds in.
    expect(await parts()).toEqual([{ text: "that plans your day.", noise: false }]);
    // Step into the change: "that " stays put while the words after it are noise.
    let changing: Awaited<ReturnType<typeof parts>> | undefined;
    for (let i = 0; i < 60 && !changing; i++) {
      await page.clock.runFor(50);
      const now = await parts();
      if (now.some((p) => p.noise)) changing = now;
    }
    expect(changing?.[0]).toMatchObject({ noise: false, text: expect.stringMatching(/^that /) });
    expect(changing?.map((p) => p.text).join("")).not.toContain("plans");
    await page.clock.runFor(1000);
    expect(await parts()).toEqual([{ text: "that checks every answer.", noise: false }]);
  });
});

test.describe("the headline on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("does not rotate: the first phrase stays", async ({ page }) => {
    await page.clock.install();
    await page.goto("/");
    await expect(page.locator("h1 [data-pending]")).toHaveCount(0);
    for (let t = 0; t < 7000; t += 250) await page.clock.runFor(250);
    await expect(page.getByText("that plans your day.", { exact: true }).filter({ visible: true })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      /Backend interview prep that plans your day, checks every answer and remembers what you miss\./,
    );
  });
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("the animated parts show their finished state", async ({ page }) => {
    await page.goto("/");
    // The headline keeps its first phrase whole instead of scrambling through three.
    // The other two copies of the phrase hold the height and are invisible; this is the live line.
    await expect(page.getByText("that plans your day.", { exact: true }).filter({ visible: true })).toBeVisible();
    // The chat is already complete, and nothing is waiting to slide in.
    await expect(page.getByText(CHAT_ANSWER, { exact: true })).toBeVisible();
    await expect(page.locator("[data-hidden]")).toHaveCount(0);
  });

  test("the demo is finished and not pinned, and the wall does not move", async ({ page }) => {
    await page.goto("/");
    const demo = page.locator('[data-landing="demo"]');
    await demo.scrollIntoViewIfNeeded();
    // Marked, booked, every day lit, and the section is no taller than its content.
    await expect(page.locator('[data-landing="demo-verdict"]')).toHaveAttribute("aria-hidden", "false");
    await expect(page.locator('[data-landing="demo-day"].bg-cyan')).toHaveCount(2);
    expect(await demo.evaluate((section: HTMLElement) => section.offsetHeight)).toBeLessThan(
      await page.evaluate(() => window.innerHeight * 2),
    );
    const wall = page.locator('[data-landing="feed-wall"]');
    await wall.scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    expect(
      await wall
        .locator("[data-wall-column]")
        .first()
        .evaluate((el) => (el as HTMLElement).style.transform),
    ).toBe("");
  });

  test("Ren holds still", async ({ page }) => {
    await page.goto("/");
    const ren = page.locator('canvas[data-landing="ren"]');
    await expect(ren).toHaveAttribute("data-ready", "true");
    const first = await ren.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
    await page.waitForTimeout(900);
    expect(await ren.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())).toBe(first);
  });

  test("no particles, no smooth scrolling, and the dot wordmark is drawn finished", async ({ page }) => {
    await page.goto("/");
    const particles = page.locator('canvas[data-landing="particles"]');
    // The overlay's engine is never loaded: its canvas keeps the browser's default size and stays blank.
    await page.waitForTimeout(1500);
    expect(await particles.evaluate((canvas: HTMLCanvasElement) => canvas.width)).toBe(300);
    expect(
      await particles.evaluate((canvas: HTMLCanvasElement) => canvas.getContext("2d")!.getImageData(0, 0, 300, 150).data.some(Boolean)),
    ).toBe(false);
    await expect(page.locator("html")).not.toHaveClass(/lenis/);
    // Ren is already there: no intro to wait for.
    await expect(page.locator('canvas[data-landing="ren"]')).toHaveAttribute("data-ready", "true");
    // The wordmark is drawn once, every letter dot lit, with none of the cursor's light moving.
    const wordmark = page.locator('canvas[data-landing="wordmark"]');
    await wordmark.scrollIntoViewIfNeeded();
    await expect.poll(() => wordmark.evaluate((canvas: HTMLCanvasElement) => canvas.width)).toBeGreaterThan(300);
    const first = await wordmark.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
    await page.waitForTimeout(900);
    expect(await wordmark.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())).toBe(first);
  });
});

test.describe("with motion", () => {
  test("the particles run, they bring Ren in, and wheel scrolling is smoothed", async ({ page }) => {
    await page.goto("/");
    const particles = page.locator('canvas[data-landing="particles"]');
    // Once the engine has loaded it sizes its canvas to the page, and the intro draws on it.
    await expect.poll(() => particles.evaluate((canvas: HTMLCanvasElement) => canvas.width), { timeout: 10_000 }).toBeGreaterThan(300);
    await expect
      .poll(
        () =>
          particles.evaluate((canvas: HTMLCanvasElement) =>
            canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data.some(Boolean),
          ),
        {
          timeout: 10_000,
        },
      )
      .toBe(true);
    // The overlay never gets in the way of a click.
    await expect(page.locator('canvas[data-landing="particles"]').locator("xpath=..")).toHaveCSS("pointer-events", "none");
    await expect(page.locator("html")).toHaveClass(/lenis/);
    // After the intro, Ren is showing: the overlay has handed it its opacity.
    await expect(page.locator('canvas[data-landing="ren"]')).toHaveCSS("opacity", "1", { timeout: 10_000 });
  });
});

for (const { name, width, height, isMobile } of [
  { name: "desktop", width: 1280, height: 800, isMobile: false },
  { name: "phone", width: 390, height: 844, isMobile: true },
]) {
  test.describe(`the hero's words and buttons, ${name}`, () => {
    test.use({ viewport: { width, height }, isMobile, hasTouch: isMobile });

    test("two ways in, one subhead, the consent line, and the dev note with its label in the footer", async ({ page }) => {
      await page.goto("/");
      const hero = page.locator('[data-landing="hero"]');
      const tryLink = hero.getByRole("link", {
        name: "Try a card, no sign-in",
      });
      const google = hero.locator('[data-cta="hero"]');
      await expect(tryLink).toHaveAttribute("href", "/try");
      await expect(google).toHaveText("Continue with Google");
      await expect(hero.getByText("Google sign-in. Installs on phone and desktop.")).toBeVisible();
      await expect(hero.locator('[data-landing="consent"]')).toContainText("By continuing you agree to the Terms and Privacy Policy.");
      await expect(hero.locator('[data-landing="dev-note"]')).toHaveCount(0);
      const note = page.locator('[data-landing="dev-note"]').filter({ visible: true });
      await note.scrollIntoViewIfNeeded();
      await expect(note).toContainText("dev note: the landing page shows off. The app inside is calm.");
      await expect(note.locator('[data-landing="dev-note-label"]')).toHaveClass(/text-ren-hot/);
      // Side by side wide, stacked and full width on a phone.
      const [a, b] = await Promise.all([tryLink.boundingBox(), google.boundingBox()]);
      if (!a || !b) throw new Error("both buttons must be laid out");
      if (isMobile) {
        expect(b.y).toBeGreaterThan(a.y + a.height - 1);
        expect(a.width).toBeCloseTo(b.width, 0);
      } else {
        expect(Math.abs(a.y - b.y)).toBeLessThan(2);
        expect(b.x).toBeGreaterThan(a.x + a.width);
      }
    });

    test("the subhead is the phone sentence on a phone and the desktop sentences on desktop", async ({ page }) => {
      await page.goto("/");
      // Both variants are in the DOM; only the one for this layout is laid out.
      const lede = page.locator('[data-landing="hero"] p span:visible', {
        hasText: "Pick 30, 60 or 90 days.",
      });
      await expect(lede).toHaveCount(1);
      await expect(lede).toHaveText(
        isMobile
          ? "Pick 30, 60 or 90 days. Daily work from your weakest areas across DSA, system design, Java, SQL and CS core."
          : "Pick 30, 60 or 90 days. 90x picks each day's work from your weakest areas across DSA, system design, Java, SQL and CS core, and checks every answer.",
      );
    });
  });
}

test("the proof strip has the four true numbers and no people-counts", async ({ page }) => {
  await page.goto("/");
  const proof = page.locator('[data-landing="proof"]');
  await expect(proof).toContainText("3,693");
  await expect(proof).toContainText("273");
  await expect(proof).toContainText("44");
  await expect(proof.getByRole("link", { name: /Code/ })).toHaveAttribute("href", "https://github.com/Am4nn/90x");
  await expect(proof).toContainText("MIT");
  await expect(page.locator("main")).not.toContainText(/testimonial|\d+ users|rated|20 minutes a day|grades what you type/i);
});

test("the nav's How it works link scrolls to the strip", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "How it works" }).click();
  await expect(page).toHaveURL(/#how$/);
  const how = page.locator("#how");
  await expect
    .poll(async () => {
      const box = await how.boundingBox();
      if (!box) throw new Error("how-a-day strip has no layout box");
      return Math.abs(box.y);
    })
    .toBeLessThan(80);
  await expect(page.getByRole("heading", { name: "How a day works." })).toBeInViewport();
});

test("the close has both ways in and the consent line, wide", async ({ page }) => {
  await page.goto("/");
  const close = page.locator('[data-landing="close"]');
  await close.scrollIntoViewIfNeeded();
  await expect(close.getByRole("heading", { name: "Day 1 starts with a card." })).toBeVisible();
  await expect(close.getByRole("link", { name: "Try a card, no sign-in" })).toHaveAttribute("href", "/try");
  await expect(close.locator('[data-cta="close"]')).toHaveText("Continue with Google");
  await expect(close.locator('[data-landing="consent"]')).toContainText("By continuing you agree to the Terms and Privacy Policy.");
  await expect(close.getByText("Backend interview prep. Five areas, one plan.")).toBeHidden();
  await expect(close.getByRole("contentinfo")).toBeHidden();
  await expect(page.getByRole("contentinfo")).toHaveCount(1);
});

for (const [width, height, isMobile] of [
  [1280, 800, false],
  [390, 844, true],
] as const) {
  test.describe(`the stage over the hero, ${width}px`, () => {
    test.use({ viewport: { width, height }, isMobile, hasTouch: isMobile });

    test("after the intro nothing is drawn over the hero, and Ren is whole", async ({ page }) => {
      await page.goto("/");
      await expect(page.locator('canvas[data-landing="ren"]')).toHaveCSS("opacity", "1", { timeout: 10_000 });
      await page.waitForTimeout(800);
      const lit = await page
        .locator('canvas[data-landing="particles"]')
        .evaluate((c: HTMLCanvasElement) => c.getContext("2d")?.getImageData(0, 0, c.width, c.height).data.some(Boolean));
      expect(lit).toBe(false);
    });
  });
}

test("the head says what the page is: title, description, canonical, JSON-LD, share images", async ({ page, request }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("90x, interview prep that plans your day");
  const subhead =
    "Pick 30, 60 or 90 days. 90x picks each day's work from your weakest areas across DSA, system design, Java, SQL and CS core, and checks every answer.";
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", subhead);
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", "90x, interview prep that plans your day");
  await expect(page.locator('meta[property="og:description"]')).toHaveAttribute("content", subhead);
  const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent()) ?? "{}");
  expect(ld).toMatchObject({
    "@type": "SoftwareApplication",
    name: "90x",
    offers: { price: "0" },
  });
  for (const selector of ['meta[property="og:image"]', 'meta[name="twitter:image"]']) {
    const src = await page.locator(selector).getAttribute("content");
    if (!src) throw new Error(`${selector} has no content`);
    const response = await request.get(new URL(src).pathname);
    expect(response.status(), selector).toBe(200);
    expect(response.headers()["content-type"]).toBe("image/png");
  }
});

test("the sitemap and robots say what is public", async ({ request }) => {
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1] ?? "").pathname)).toEqual([
    "/",
    "/try",
    "/privacy",
    "/terms",
  ]);
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toMatch(/Allow: \/try/);
  expect(robots).toMatch(/Disallow: \/today/);
});
