import { expect, type Page, test } from "@playwright/test";
import { signIn } from "./helpers";

// A tap on a tab is felt on the same frame: the tab turns selected and the target's
// skeleton shows while the server is still working. To prove it, every RSC request is
// held for a few seconds, so nothing can be satisfied from the network in time.
const HOLD_MS = 3000;
const FEEDBACK_MS = 150;

async function holdServer(page: Page) {
  await page.route("**/*", async (route) => {
    if (route.request().headers()["rsc"] === "1") await new Promise((r) => setTimeout(r, HOLD_MS));
    await route.continue();
  });
}

// The phone tab bar, or the desktop sidebar: the two never show together.
const tab = (page: Page, isMobile: boolean, name: string) =>
  page.locator(isMobile ? "nav[aria-label=Main]" : "aside").getByRole("link", { name, exact: true });

const skeleton = (page: Page, name: string) => page.getByLabel(`Loading ${name}`, { exact: true });

for (const name of ["Library", "Coach", "Me", "Feed"]) {
  test(`tapping ${name} selects it and shows its skeleton at once`, { tag: "@mobile" }, async ({ page, isMobile }) => {
    await holdServer(page);
    await signIn(page, "instant");
    await tab(page, isMobile, name).click();
    await expect(tab(page, isMobile, name)).toHaveAttribute("aria-current", "page", { timeout: FEEDBACK_MS });
    await expect(tab(page, isMobile, "Today")).not.toHaveAttribute("aria-current", "page");
    await expect(skeleton(page, name)).toBeVisible({ timeout: FEEDBACK_MS });
    // The real page replaces it once the held response arrives.
    await expect(page).toHaveURL(new RegExp(`/${name.toLowerCase()}$`));
    await expect(page.getByRole("heading", { name, exact: true, level: 1 })).toBeVisible({ timeout: HOLD_MS * 3 });
  });
}

test("tapping a second tab mid-flight: the latest one wins", { tag: "@mobile" }, async ({ page, isMobile }) => {
  await holdServer(page);
  await signIn(page, "instant");
  await tab(page, isMobile, "Library").click();
  await tab(page, isMobile, "Coach").click();
  await expect(tab(page, isMobile, "Coach")).toHaveAttribute("aria-current", "page", { timeout: FEEDBACK_MS });
  await expect(tab(page, isMobile, "Library")).not.toHaveAttribute("aria-current", "page");
  await expect(skeleton(page, "Coach")).toBeVisible({ timeout: FEEDBACK_MS });
  await expect(page).toHaveURL(/\/coach$/);
});

test("the top progress bar appears for a slow navigation and goes when it lands", { tag: "@mobile" }, async ({ page, isMobile }) => {
  await holdServer(page);
  await signIn(page, "instant");
  const bar = page.locator(".nav-progress");
  await tab(page, isMobile, "Me").click();
  // Delayed ~120ms in CSS, so a fast navigation never flashes it.
  await expect(bar).toBeVisible({ timeout: 1000 });
  await expect(page).toHaveURL(/\/me$/);
  await expect(bar).toHaveCount(0, { timeout: HOLD_MS * 3 });
});

test("Back and Forward keep the selected tab in step", { tag: "@mobile" }, async ({ page, isMobile }) => {
  await signIn(page, "instant");
  await tab(page, isMobile, "Library").click();
  await expect(page).toHaveURL(/\/library$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/today$/);
  await expect(tab(page, isMobile, "Today")).toHaveAttribute("aria-current", "page");
  await expect(tab(page, isMobile, "Library")).not.toHaveAttribute("aria-current", "page");
  await page.goForward();
  await expect(tab(page, isMobile, "Library")).toHaveAttribute("aria-current", "page");
});
