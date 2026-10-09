import { expect, type Page, test } from "@playwright/test";
import { signIn } from "./helpers";

const chip = (page: Page, group: string, label: string) =>
  page.getByRole("radiogroup", { name: group }).getByRole("radio", { name: label });

test.describe("Set up", () => {
  // The browser says Tokyo; the server runs in UTC. Set up must offer Tokyo.
  test.use({ timezoneId: "Asia/Tokyo" });

  test("defaults the time zone to the device's, not the server's", async ({ page }) => {
    await signIn(page, "tz-setup", { setup: true, next: "/setup" });
    await page.getByRole("button", { name: "Get started" }).click();
    await page.getByLabel("Name", { exact: true }).fill("Aman");
    await chip(page, "Target role", "Frontend engineer").click();
    await chip(page, "Language for DSA", "Python").click();
    await page.getByRole("button", { name: "Continue" }).click();
    await chip(page, "Your level", "Interview-ready").click();
    await page.getByRole("button", { name: "Continue" }).click();

    const zone = page.getByLabel("Time zone");
    await expect(zone).toHaveValue("Asia/Tokyo");
    await expect(zone.locator("option:checked")).toHaveText("Asia/Tokyo · GMT+9");
  });
});

test("Settings changes the time zone by hand, and it stays changed", async ({ page }) => {
  await signIn(page, "tz-settings", { next: "/me/settings" });
  const row = page.getByTestId("timezone-setting");
  // The e2e user is set up in UTC.
  await expect(row).toContainText("UTC · GMT");

  await row.getByRole("button", { name: "Edit" }).click();
  await row.getByLabel("Timezone").selectOption("Europe/London");
  await row.getByRole("button", { name: "Save" }).click();
  await expect(row.getByRole("status")).toHaveText("Saved. Your days now start at midnight in this zone.");
  await expect(row).toContainText("Europe/London");

  await page.reload();
  await expect(page.getByTestId("timezone-setting")).toContainText("Europe/London");
  // Today still plans and shows its day in the new zone.
  await page.goto("/today");
  await expect(page.getByTestId("day-summary")).toBeVisible();
});

test("Cancel leaves the time zone as it was", async ({ page }) => {
  await signIn(page, "tz-cancel", { next: "/me/settings" });
  const row = page.getByTestId("timezone-setting");
  await row.getByRole("button", { name: "Edit" }).click();
  await row.getByLabel("Timezone").selectOption("Asia/Tokyo");
  await row.getByRole("button", { name: "Cancel" }).click();
  await expect(row).toContainText("UTC · GMT");
  await page.reload();
  await expect(page.getByTestId("timezone-setting")).toContainText("UTC · GMT");
});
