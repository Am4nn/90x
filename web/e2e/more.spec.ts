import { expect, test } from "@playwright/test";
import { finishOne, gotoToday, missions, openMissions, signIn } from "./helpers";

// Extra missions say so on their row; they are what "Want more?" adds.
const extras = (page: Parameters<typeof gotoToday>[0]) =>
  missions(page).getByRole("listitem").filter({ hasText: "Extra: doesn't count toward today" });

test('"Want more?" appears once the day is done and adds extra missions', async ({ page }) => {
  await signIn(page, "more");
  await expect(missions(page)).toBeVisible();
  // Not offered while the day still has open missions.
  const planned = await openMissions(page).count();
  expect(planned).toBeGreaterThan(0);
  await expect(page.getByText("Want more?", { exact: true })).toHaveCount(0);

  for (let i = 0; i < planned; i++) {
    await gotoToday(page);
    await finishOne(page);
  }
  await gotoToday(page);
  await expect(page.getByText("All done. The square is yours.")).toBeVisible();
  await expect(page.getByText("Want more?", { exact: true })).toBeVisible();
  await expect(extras(page)).toHaveCount(0);

  await page.getByRole("button", { name: "One more problem", exact: true }).click();
  await expect(extras(page)).toHaveCount(1);
  await expect(extras(page).first().getByRole("link")).toHaveAttribute("href", /^\/library\/problem\//);

  await page.getByRole("button", { name: "10 more cards", exact: true }).click();
  await expect(extras(page)).toHaveCount(2);
  await expect(extras(page).filter({ has: page.getByRole("link", { name: "10 cards", exact: true }) })).toHaveCount(1);

  // Extras are bonus work: the day stays done and the offer stays.
  await expect(page.getByText("All done. The square is yours.")).toBeVisible();
  await expect(page.getByRole("img", { name: "1 of 90 days done" })).toBeVisible();
  await expect(page.getByText("Want more?", { exact: true })).toBeVisible();
});
