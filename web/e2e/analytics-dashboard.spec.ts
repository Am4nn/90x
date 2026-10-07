import { expect, test } from "@playwright/test";
import { setLaunchDate, signIn } from "./helpers";

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

test("the Launch gate panel is hidden until a launch date is set, then shows and hides again", async ({ page }) => {
  await signIn(page, "admin-launch-gate", { admin: true, next: "/admin/analytics" });
  await expect(page.getByRole("heading", { name: "Analytics", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Launch gate", exact: true })).toHaveCount(0);

  try {
    await setLaunchDate(page, new Date().toISOString().slice(0, 10));
    await page.goto("/admin/analytics");
    const gate = page.getByRole("region", { name: "Launch gate" });
    await expect(page.getByRole("heading", { name: "Launch gate", exact: true })).toBeVisible();
    // Node's UTC date can be a day behind the server's around midnight, so day 0 or 1; both are on track at pace 0.
    await expect(gate.getByText(/^Day [01] of 30$/)).toBeVisible();
    await expect(gate.getByText("on track", { exact: true })).toBeVisible();
    await expect(gate.getByText(/^\d+ of 20$/).first()).toBeVisible();
    await expect(gate.getByText(/^pace for day [01]: 0 of 20$/)).toBeVisible();
    await expect(gate.getByText("Returners can't appear before day 7.")).toBeVisible();
    await expect(gate.getByText(/%/)).toHaveCount(0);
    await expect(gate.getByRole("progressbar", { name: "Week-2 returners" })).toBeVisible();
  } finally {
    // The e2e database is shared: clear the date so other specs and a later run start hidden.
    await setLaunchDate(page, "");
  }
  await page.goto("/admin/analytics");
  await expect(page.getByRole("heading", { name: "Launch gate", exact: true })).toHaveCount(0);
});
