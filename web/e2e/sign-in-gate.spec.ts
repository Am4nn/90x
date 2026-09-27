import { expect, test } from "@playwright/test";

test("signed-out visitors land on sign-in with the Google button", async ({ page }) => {
  await page.goto("/today");
  await expect(page).toHaveURL("/sign-in");
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
});
