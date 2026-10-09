import { expect, type Page, test } from "@playwright/test";
import { signIn } from "./helpers";

// The first-visit demo after the welcome.
const demo = (page: Page) => page.getByTestId("demo");
const card = (page: Page) => demo(page).getByRole("dialog");

async function holdThroughWelcome(page: Page) {
  const hold = page.getByTestId("welcome").getByRole("button", { name: "Hold: I'm in" });
  await hold.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("welcome")).toHaveCount(0);
}

test("after the welcome: plan and me, then audio, then gone for good", { tag: "@mobile" }, async ({ page }) => {
  await signIn(page, "demo-full", { welcome: true, tips: true });
  await holdThroughWelcome(page);
  await expect(card(page)).toContainText("Your plan and settings");
  await expect(card(page)).toContainText("1 of 2");
  await expect(demo(page).getByTestId("demo-ring")).toHaveCount(2);

  await card(page).getByRole("button", { name: "Next" }).click();
  await expect(card(page)).toContainText("Lessons you can listen to");
  await expect(card(page)).toContainText("2 of 2");
  await expect(demo(page).getByTestId("demo-ring")).toHaveCount(1);

  await card(page).getByRole("button", { name: "Done" }).click();
  await expect(demo(page)).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("day-summary")).toBeVisible();
  await expect(demo(page)).toHaveCount(0);
});

test("Listen to one opens the Generative AI lesson", { tag: "@mobile" }, async ({ page }) => {
  await signIn(page, "demo-listen", { tips: true });
  await card(page).getByRole("button", { name: "Next" }).click();
  await card(page).getByRole("link", { name: "Listen to one" }).click();
  await expect(page).toHaveURL(/\/library\/topic\/ai-generative-ai-llms$/);
  await page.goto("/today");
  await expect(page.getByTestId("day-summary")).toBeVisible();
  await expect(demo(page)).toHaveCount(0);
});

test("Skip ends the demo for good", async ({ page }) => {
  await signIn(page, "demo-skip", { tips: true });
  await card(page).getByRole("button", { name: "Skip" }).click();
  await expect(demo(page)).toHaveCount(0);
  // Skip hides the demo at once and saves in the background (as does each step it shows), so one reload could
  // land before the save. "For good" means: once the save lands, a reload no longer brings it back.
  await expect(async () => {
    await page.reload();
    await expect(page.getByTestId("day-summary")).toBeVisible();
    await expect(demo(page)).toHaveCount(0, { timeout: 1000 });
  }).toPass({ timeout: 15_000 });
});

test("Escape ends the demo too", async ({ page }) => {
  await signIn(page, "demo-escape", { tips: true });
  await expect(card(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(demo(page)).toHaveCount(0);
});

test("Skip on the welcome still leads into the demo", async ({ page }) => {
  await signIn(page, "demo-welcome-skip", { welcome: true, tips: true });
  await page.getByTestId("welcome").getByRole("button", { name: "Skip" }).click();
  await expect(card(page)).toContainText("1 of 2");
});

test("the Me ring sits on the visible Me control, and follows a resize", { tag: "@mobile" }, async ({ page }) => {
  await signIn(page, "demo-ring", { tips: true });
  const me = page.locator('[data-tip="me"]').filter({ visible: true }).first();
  // Rings follow the step's anchors: plan, then me.
  const ring = demo(page).getByTestId("demo-ring").nth(1);
  const near = async () => {
    await expect(ring).toBeVisible();
    const [a, b] = [await me.boundingBox(), await ring.boundingBox()];
    expect(Math.abs(a!.x - b!.x)).toBeLessThan(12);
    expect(Math.abs(a!.y - b!.y)).toBeLessThan(12);
  };
  await near();
  const v = page.viewportSize()!;
  await page.setViewportSize({ width: v.width, height: v.height - 120 });
  await expect.poll(async () => Math.abs((await me.boundingBox())!.y - (await ring.boundingBox())!.y)).toBeLessThan(12);
});

test("no demo for an account that has seen it", async ({ page }) => {
  await signIn(page, "demo-none");
  await expect(page.getByTestId("day-summary")).toBeVisible();
  await expect(demo(page)).toHaveCount(0);
});

test("a refresh of Today mid-demo keeps the step it shows", async ({ page }) => {
  await signIn(page, "demo-refresh", { tips: true });
  await expect(card(page)).toContainText("1 of 2");
  // Step 1 is stored as seen once shown; a fresh server render must not reshuffle the open demo.
  await page.evaluate(() => (window as unknown as { next: { router: { refresh: () => void } } }).next.router.refresh());
  await page.waitForTimeout(1500);
  await expect(card(page)).toContainText("1 of 2");
  await expect(card(page)).toContainText("Your plan and settings");
});

test("keyboard focus stays in the card, and comes back to the page after", async ({ page }) => {
  await signIn(page, "demo-focus", { tips: true });
  await expect(card(page)).toBeVisible();
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Tab");
    expect(await card(page).evaluate((el) => el.contains(document.activeElement))).toBe(true);
  }
  await card(page).getByRole("button", { name: "Next" }).click();
  await card(page).getByRole("button", { name: "Done" }).click();
  await expect(demo(page)).toHaveCount(0);
  expect(await page.evaluate(() => document.activeElement?.getAttribute("data-tip"))).toBe("plan");
});

test("every button in the demo is a 44px tap target on a phone", { tag: "@mobile" }, async ({ page }) => {
  // Phones only: desktop keeps its 36px buttons (a pointer, not a thumb).
  test.skip(page.viewportSize()!.width >= 768, "phone tap targets");
  await signIn(page, "demo-taps", { tips: true });
  await expect(card(page)).toBeVisible();
  for (const name of ["Skip", "Next"]) {
    const box = await card(page).getByRole("button", { name }).boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
});
