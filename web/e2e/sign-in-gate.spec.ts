import { expect, test } from "@playwright/test";

test("signed-out visitors land on the front page with the Google button", async ({ page }) => {
  await page.goto("/today");
  await expect(page).toHaveURL("/");
  // The hero's button and the closing one share a name.
  await expect(page.getByRole("button", { name: "Continue with Google" }).first()).toBeVisible();
});
