import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";
import { DRAFT_BATCH } from "./seed-data";

test("an admin sees the seeded draft batch in /admin/cards", async ({ page }) => {
  await signIn(page, "admin", { admin: true, next: "/admin/cards" });
  await expect(page.getByRole("link", { name: new RegExp(DRAFT_BATCH.label) })).toBeVisible();
});

// The proxy answers a non-admin with a real 404 before the page runs; the page's own
// requireAdmin() is the second lock and would give the same 404 page.
test("a non-admin gets the 404 page for /admin/cards", async ({ page }) => {
  await signIn(page, "member");
  await page.goto("/admin/cards");
  await expect(page.getByRole("heading", { name: "No such page." })).toBeVisible();
  await expect(page.locator('head meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(page.getByText(DRAFT_BATCH.label)).toHaveCount(0);
});

test("the Cards page links to the Rated page", async ({ page }) => {
  await signIn(page, "admin-rated", { admin: true, next: "/admin/cards" });
  await page.getByRole("link", { name: /No ratings yet|average/ }).click();
  await expect(page.getByRole("heading", { name: "Rated", exact: true })).toBeVisible();
});

test("an admin saves the AI caps on Settings and they stay saved", async ({ page }) => {
  await signIn(page, "admin-settings", { admin: true, next: "/admin/settings" });
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  await page.getByLabel("Daily cap").fill("4");
  await page.getByLabel("Monthly cap").fill("40");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Daily cap")).toHaveValue("4");
  await expect(page.getByLabel("Monthly cap")).toHaveValue("40");
  // Put the defaults back: the e2e database is shared by the other specs.
  await page.getByLabel("Daily cap").fill("3");
  await page.getByLabel("Monthly cap").fill("30");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
});

test("a non-admin gets the 404 page for /admin/settings", async ({ page }) => {
  await signIn(page, "member-settings");
  await page.goto("/admin/settings");
  await expect(page.getByRole("heading", { name: "No such page." })).toBeVisible();
  await expect(page.getByLabel("Daily cap")).toHaveCount(0);
});
