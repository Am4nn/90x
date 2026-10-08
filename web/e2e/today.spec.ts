import { expect, test } from "@playwright/test";
import { missionRow, missions, signIn } from "./helpers";

test("Today shows the day line, the grid and a mission", { tag: "@mobile" }, async ({ page }) => {
  await signIn(page, "today");
  await expect(page.getByText(/^Day 1 · 0-day streak · 89 days left$/)).toBeVisible();
  await expect(page.getByRole("img", { name: "0 of 90 days done" })).toBeVisible();
  await expect(missions(page).getByRole("listitem").first()).toBeVisible();
});

test("the 10 cards mission wears a Feed badge, since the Feed runs every area", async ({ page }) => {
  await signIn(page, "today-cards", { cards: true });
  const row = missionRow(page, "10 cards");
  await expect(row.getByText("Feed", { exact: true })).toBeVisible();
  await expect(row.getByText("CS", { exact: true })).toHaveCount(0);
});
