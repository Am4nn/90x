import { expect, type Page, test } from "@playwright/test";
import { checkInSolved, gotoToday, missions, openMissions, signIn } from "./helpers";

/** Finish the first open mission on Today the way a user would. */
async function finishOne(page: Page) {
  const row = openMissions(page).first();
  const link = row.getByRole("link");
  const href = (await link.getAttribute("href")) ?? "";
  const title = (await link.innerText()).trim();
  if (href.startsWith("/library/problem/")) {
    await page.goto(href);
    await checkInSolved(page);
    return;
  }
  const button = row.getByRole("button", { name: /^(Mark studied|Not today)$/ });
  if (await button.count()) {
    // Wait for the server action itself: navigating away first would cancel it.
    await Promise.all([page.waitForResponse((r) => r.request().method() === "POST"), button.click()]);
    return;
  }
  // The e2e plan has no card slot (see the sign-in route); a card mission needs the Feed.
  throw new Error(`No way to finish "${title}" (${href}) from this test`);
}

test("finishing every mission marks the day done on the grid", async ({ page }) => {
  await signIn(page, "finish");
  await expect(missions(page)).toBeVisible();
  const planned = await openMissions(page).count();
  expect(planned).toBeGreaterThan(0);
  for (let i = 0; i < planned; i++) {
    await gotoToday(page);
    await finishOne(page);
  }

  await gotoToday(page);
  await expect(openMissions(page)).toHaveCount(0);
  await expect(page.getByText("Day done. The square is yours.")).toBeVisible();
  const grid = page.getByRole("img", { name: "1 of 90 days done" });
  await expect(grid).toBeVisible();
  await expect(grid.locator("[data-today]")).toHaveAttribute("data-s", "done");
});
