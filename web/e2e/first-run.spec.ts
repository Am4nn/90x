import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

const welcome = (page: import("@playwright/test").Page) => page.getByTestId("welcome");

test("the welcome says how a day is picked, and Skip closes it for good", { tag: "@mobile" }, async ({ page }) => {
  await signIn(page, "first-run-skip", { welcome: true });
  await expect(welcome(page).getByRole("heading", { name: "Your coach curates every day" })).toBeVisible();
  for (const step of ["Reviews due", "Your weakest pattern", "Your weakest area", "10 cards"]) {
    await expect(welcome(page).getByText(step, { exact: true })).toBeVisible();
  }
  // The e2e user's budget is 110 minutes, the same every day.
  await expect(welcome(page).getByText("1h 50m a day")).toBeVisible();

  await welcome(page).getByRole("button", { name: "Skip" }).click();
  await expect(welcome(page)).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("day-summary")).toBeVisible();
  await expect(welcome(page)).toHaveCount(0);
});

test("the welcome is one page: holding Hold closes it for good", { tag: "@mobile" }, async ({ page }) => {
  await signIn(page, "first-run-hold", { welcome: true });
  await expect(welcome(page).getByRole("heading", { name: "Your coach curates every day" })).toBeVisible();
  await expect(welcome(page).getByRole("button", { name: "Next" })).toHaveCount(0);
  await expect(welcome(page).getByText("Day 1 of 90 starts now")).toBeVisible();

  const hold = welcome(page).getByRole("button", { name: "Hold: I'm in" });
  // A tap is not a hold.
  await hold.click();
  await expect(welcome(page)).toBeVisible();

  const box = (await hold.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(welcome(page)).toHaveCount(0);
  await page.mouse.up();
  await page.reload();
  await expect(page.getByTestId("day-summary")).toBeVisible();
  await expect(welcome(page)).toHaveCount(0);
});

test("from the keyboard the hold commits on Enter", async ({ page }) => {
  await signIn(page, "first-run-keys", { welcome: true });
  await welcome(page).getByRole("button", { name: "Hold: I'm in" }).focus();
  await page.keyboard.press("Enter");
  await expect(welcome(page)).toHaveCount(0);
});

test("a user signed in without the flag never sees it", async ({ page }) => {
  await signIn(page, "first-run-none");
  await expect(page.getByTestId("day-summary")).toBeVisible();
  await expect(welcome(page)).toHaveCount(0);
});
