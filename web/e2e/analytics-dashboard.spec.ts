import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test("an admin sees the Analytics sections and can change the range", async ({ page }) => {
  await signIn(page, "admin-analytics", { admin: true, next: "/admin/analytics" });
  await expect(page.getByRole("heading", { name: "Analytics", exact: true })).toBeVisible();
  for (const name of ["Growth", "Activation and return", "Engagement", "Cost"]) {
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  }
  // The admin just signed up, so the signup count is at least one, shown as a count.
  await expect(page.getByText("in the last 30 days").first()).toBeVisible();
  await page.getByRole("link", { name: "7 days" }).click();
  await expect(page).toHaveURL(/range=7/);
  await expect(page.getByText("in the last 7 days").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Analytics" }).first()).toHaveAttribute("aria-current", "page");
});

test("a non-admin gets the 404 page for /admin/analytics", async ({ page }) => {
  await signIn(page, "member-analytics");
  await page.goto("/admin/analytics");
  await expect(page.getByRole("heading", { name: "No such page." })).toBeVisible();
  await expect(page.getByText("Signups by source")).toHaveCount(0);
});
