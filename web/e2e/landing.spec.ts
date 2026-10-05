import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

// The public front door (src/app/page.tsx), built to the approved design.

const CHAT_ANSWER = "In 4 of your last 6 attempts you shrank the window before checking the condition.";

test("a signed-out visitor sees the page and its sign-in buttons", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL("/");
  // The animated lines are hidden from screen readers; the heading says the whole sentence once.
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    /A coach that grades what you type, plans your next day and remembers what you miss\./,
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
    await route.fulfill({ status: 200, contentType: "text/html", body: "<title>stub</title>" });
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
    route.fulfill({ status: 200, contentType: "text/html", body: "<title>stub</title>" }),
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

  await scrollTo(1);
  await expect(page.getByText("Back before you forget.", { exact: true })).toBeVisible();
  await expect(lit).toHaveCount(2);
  // The strip's labels, over their squares; no percentage anywhere.
  await expect(page.getByText("Wrong answers return tomorrow. Right ones, a month later.")).toBeVisible();
  await expect(demo).not.toContainText("%");
});

test("the Feed wall drifts, its second set is hidden from screen readers, and it counts ten kinds", async ({ page }) => {
  await page.goto("/");
  const wall = page.locator('[data-landing="feed-wall"]');
  await wall.scrollIntoViewIfNeeded();
  await expect(page.getByText("Ten kinds of card. Every one marked.")).toBeVisible();
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

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("the animated parts show their finished state", async ({ page }) => {
    await page.goto("/");
    // The headline keeps its first phrase whole instead of scrambling through three.
    await expect(page.getByText("grades what you type.", { exact: true })).toBeVisible();
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
