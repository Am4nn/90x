import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";
import { DRAFT_BATCH } from "./seed-data";

test("an admin sees the seeded draft batch in /admin/cards", async ({ page }) => {
  await signIn(page, "admin", { admin: true, next: "/admin/cards" });
  await expect(page.getByRole("link", { name: new RegExp(DRAFT_BATCH.label) })).toBeVisible();
});

// The page streams its loading skeleton before the admin check runs, so the
// status is already 200 when notFound() fires: a soft 404, which Next marks noindex.
test("a non-admin gets the 404 page for /admin/cards", async ({ page }) => {
  await signIn(page, "member");
  await page.goto("/admin/cards");
  await expect(page.getByRole("heading", { name: "No such page." })).toBeVisible();
  await expect(page.locator('head meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(page.getByText(DRAFT_BATCH.label)).toHaveCount(0);
});
