import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";

/**
 * Signs in through the test-only route (src/app/api/test/sign-in) as a new
 * user, approved, set up and on a fresh campaign. Every call makes a new user,
 * so tests, projects and retries never share a day's state.
 */
export async function signIn(page: Page, name: string, options: { admin?: boolean; next?: string } = {}) {
  const next = options.next ?? "/today";
  const params = new URLSearchParams({ email: `${name}-${randomUUID().slice(0, 8)}@e2e.test`, next });
  if (options.admin) params.set("admin", "1");
  await page.goto(`/api/test/sign-in?${params}`);
  await expect(page).toHaveURL(next);
}

export const missions = (page: Page) => page.getByRole("list", { name: "Missions" });

/** Open Today and wait for the missions to stream in behind the skeleton. */
export async function gotoToday(page: Page) {
  await page.goto("/today");
  await expect(missions(page)).toBeVisible();
}

export const openMissions = (page: Page) =>
  missions(page)
    .getByRole("listitem")
    .filter({ has: page.getByLabel("Open", { exact: true }) });

/** The Today row for a mission, by its exact title ("Two Sum" must not match "Two Sum II"). */
export const missionRow = (page: Page, title: string) =>
  missions(page)
    .getByRole("listitem")
    .filter({ has: page.getByRole("link", { name: title, exact: true }) });

async function press(page: Page, name: string) {
  const chip = page.getByRole("button", { name, exact: true });
  if ((await chip.getAttribute("aria-pressed")) !== "true") await chip.click();
  await expect(chip).toHaveAttribute("aria-pressed", "true");
}

/** On a problem page: check in as solved in 30 minutes. */
export async function checkInSolved(page: Page) {
  await press(page, "Solved");
  await press(page, "30m");
  await page.getByRole("button", { name: "Check in", exact: true }).click();
  await expect(page.getByText("Checked in.")).toBeVisible();
}
