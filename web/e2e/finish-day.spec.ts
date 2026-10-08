import { expect, test } from "@playwright/test";
import { finishOne, gotoToday, missions, openMissions, signIn } from "./helpers";

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
  await expect(page.getByText("All done. The square is yours.")).toBeVisible();
  const grid = page.getByRole("img", { name: "1 of 90 days done" });
  await expect(grid).toBeVisible();
  await expect(grid.locator("[data-today]")).toHaveAttribute("data-s", "done");
});
