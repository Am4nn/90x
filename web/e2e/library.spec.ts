import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

const tabs = (page: import("@playwright/test").Page) => page.getByRole("tablist", { name: "Library tracks" });

test("the tab strip is the URL: each area is a link, the active one shows its count, and there is no roadmap toggle", async ({ page }) => {
  await signIn(page, "library-tabs", { next: "/library" });
  await expect(tabs(page).getByRole("tab", { name: /^DSA/ })).toHaveAttribute("aria-selected", "true");

  await tabs(page).getByRole("tab", { name: "Design" }).click();
  await expect(page).toHaveURL(/\/library\?area=system_design$/);
  const design = tabs(page).getByRole("tab", { name: /^Design/ });
  await expect(design).toHaveAttribute("aria-selected", "true");
  // The count follows the label and only the active tab has one.
  await expect(design).toHaveText(/^Design\d+$/);
  await expect(tabs(page).getByRole("tab", { name: "DSA" })).toHaveText("DSA");

  // The old `?area=` links keep working, and the roadmap view is gone.
  await page.goto("/library?area=system_design&view=roadmap");
  await expect(page.getByRole("radio", { name: "Roadmap" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /roadmap/i })).toHaveCount(0);
});

test("search opens from the button and from the keyboard, and keeps the area", async ({ page }) => {
  await signIn(page, "library-search", { next: "/library?area=system_design" });
  const field = page.getByRole("textbox", { name: "Search topics" });
  // The button only works once the page has hydrated, so retry the click until the field opens.
  await expect(async () => {
    if (!(await field.isVisible())) await page.getByRole("button", { name: "Search topics" }).click();
    await expect(field).toBeVisible({ timeout: 1000 });
  }).toPass();
  await expect(field).toBeFocused();
  await field.fill("cache");
  await field.press("Enter");
  await expect(page).toHaveURL(/area=system_design&q=cache/);
  await expect(page.getByRole("heading", { name: /Results for/ })).toBeVisible();
  await expect(tabs(page).getByRole("tab", { name: /^Design/ })).toHaveAttribute("aria-selected", "true");

  // Ctrl+K (⌘K on a Mac) opens it from anywhere on the page. The search reloaded the page, so
  // the shortcut too waits for hydration.
  await expect(async () => {
    if (!(await field.isVisible())) await page.keyboard.press("Control+k");
    await expect(field).toBeFocused({ timeout: 1000 });
  }).toPass();
  // Esc closes it and hands focus back to the button.
  await page.keyboard.press("Escape");
  await expect(field).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Search topics" })).toBeFocused();
});

test("the strip scrolls with arrows on a phone and opens on the active tab", { tag: "@mobile" }, async ({ page, isMobile }) => {
  test.skip(!isMobile, "The strip only overflows on a phone");
  await signIn(page, "library-arrows", { next: "/library?area=competitive" });
  await expect(tabs(page).getByRole("tab", { name: /^Competitive/ })).toBeInViewport();
  const left = page.getByRole("button", { name: "Previous tracks" });
  await expect(left).toBeVisible();
  await expect(page.getByRole("button", { name: "More tracks" })).toHaveCount(0);

  // Each tap moves the strip a step; at the start the left arrow goes away.
  await expect(async () => {
    if (await left.isVisible()) await left.click();
    await expect(left).toHaveCount(0, { timeout: 1000 });
  }).toPass();
  await expect(tabs(page).getByRole("tab", { name: "DSA" })).toBeInViewport();
  await expect(page.getByRole("button", { name: "More tracks" })).toBeVisible();
});
