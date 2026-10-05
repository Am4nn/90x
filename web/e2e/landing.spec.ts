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

  test("Ren holds still", async ({ page }) => {
    await page.goto("/");
    const ren = page.locator('canvas[data-landing="ren"]');
    await expect(ren).toHaveAttribute("data-ready", "true");
    const first = await ren.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
    await page.waitForTimeout(900);
    expect(await ren.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())).toBe(first);
  });
});
