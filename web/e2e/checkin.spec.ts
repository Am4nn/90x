import { expect, test } from "@playwright/test";
import { checkInSolved, gotoToday, missionRow, openMissions, signIn } from "./helpers";

test("checking in a mission's problem marks the mission done", async ({ page }) => {
  await signIn(page, "checkin");
  const link = openMissions(page).getByRole("link").and(page.locator('[href^="/library/problem/"]')).first();
  const title = (await link.innerText()).trim();
  await link.click();
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();

  await checkInSolved(page);

  await gotoToday(page);
  await expect(missionRow(page, title).getByLabel("Done", { exact: true })).toBeVisible();
});
