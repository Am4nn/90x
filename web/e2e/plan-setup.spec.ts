import { expect, type Page, test } from "@playwright/test";
import { missions, signIn } from "./helpers";

// The Plan page and Set up, plus the level, which is now more than a label.
//
// Every sign-in here makes a new user and the test route never sets a level, so
// every account in this file is one nobody has asked about. That is the state of
// every account that existed before the level column, and the state that has to
// keep planning exactly as it did before - so it is where these tests start.

const level = (page: Page) => page.getByRole("radiogroup", { name: "Your level" });
const week = (page: Page) => page.getByRole("group", { name: "Your week" });
const chip = (page: Page, group: string, label: string) =>
  page.getByRole("radiogroup", { name: group }).getByRole("radio", { name: label });
const editor = (page: Page) => page.getByRole("table");
/** The number in a day-by-day stepper. `toHaveText` on the group would see the
 *  minus and plus buttons too. */
const stepper = (page: Page, label: string) => editor(page).getByRole("group", { name: label }).locator("span.tabular");

/** Open the folded-away day-by-day editor and wait for it. */
async function adjustTheWeek(page: Page) {
  await page.getByRole("button", { name: "Adjust the week" }).click();
  await expect(editor(page)).toBeVisible();
}

test("an account that was never asked about its level plans exactly as before", async ({ page }) => {
  await signIn(page, "plan-null", { next: "/me/plan" });

  await expect(page.getByRole("heading", { name: "Plan", exact: true })).toBeVisible();
  // Null reads as `some_practice`, and that is what the chips show, so the page
  // is honest about what the planner is doing rather than showing a blank.
  await expect(level(page).getByRole("radio", { name: "Some practice" })).toHaveAttribute("aria-checked", "true");

  // The e2e fixture signs in at 110 minutes (a problem, a review and a topic,
  // and the day's 10 cards, which is not a slot), and the page must show that
  // real value, not a chip fallback.
  await expect(week(page)).toContainText("1 problem · 1 review · 1 topic");
  await expect(week(page)).toContainText("110 min on a weekday, 110 min at the weekend.");

  // The day-by-day editor is still all of it, and the length is still live.
  await expect(page.getByText(/Day 1 of 90/)).toBeVisible();
  await adjustTheWeek(page);
  await expect(editor(page).getByRole("group", { name: "New on Mon" })).toBeVisible();
});

test("no screen of the plan calls it a campaign", async ({ page }) => {
  await signIn(page, "plan-words", { next: "/me/plan" });

  await expect(page.locator("body")).not.toContainText(/campaign/i);
});

test("changing the time or the level moves the preview without a reload", async ({ page }) => {
  await signIn(page, "plan-preview", { next: "/me/plan" });
  const url = page.url();

  // Bumping a weekday from 2h to 3h buys a second problem and a second review,
  // and dropping the weekend to 1h leaves it a problem (the day's 10 cards
  // takes 15 of the 60 minutes, and a problem 40).
  await chip(page, "Time on a weekday", "Hard · 3h").click();
  await chip(page, "Time at the weekend", "Light · 1h").click();
  await expect(week(page)).toContainText("180 min on a weekday, 60 min at the weekend.");
  await expect(week(page)).toContainText("2 problems · 2 reviews · 1 topic");
  const weekend = week(page).getByRole("listitem").filter({ hasText: "Weekend" });
  await expect(weekend).toContainText("1 problem");
  await expect(weekend).not.toContainText("review");

  // The level moves the mix at the same minutes: first_time spends them on
  // reviews and topics, interview-ready on new problems.
  await chip(page, "Your level", "First time").click();
  await expect(week(page)).toContainText("1 problem · 2 reviews · 2 topics");
  await chip(page, "Your level", "Interview-ready").click();
  await expect(week(page)).toContainText("2 problems · 2 reviews · 1 topic");

  // Nothing reloaded: the URL never changed and no save was needed.
  expect(page.url()).toBe(url);
});

test("the day-by-day editor is folded away until it is asked for, then autosaves", async ({ page }) => {
  await signIn(page, "plan-editor", { next: "/me/plan" });

  await expect(editor(page)).toHaveCount(0);
  await adjustTheWeek(page);

  const monday = stepper(page, "New on Mon");
  await expect(monday).toHaveText("1");
  await editor(page).getByRole("button", { name: "More New on Mon" }).click();
  await expect(monday).toHaveText("2");
  // Autosave: there is no "Save plan" button; the change saves itself (debounced)
  // and the editor's own note confirms it landed.
  await expect(page.getByText("Saved. Applies from tomorrow.")).toBeVisible();

  // Persistence from a second page in the same context, never by reloading this
  // one: a reload cancels the in-flight server action and the write never lands.
  const other = await page.context().newPage();
  await other.goto("/me/plan");
  await adjustTheWeek(other);
  await expect(async () => {
    await expect(stepper(other, "New on Mon")).toHaveText("2");
  }).toPass({ timeout: 15_000 });
  await other.close();
});

test("Set up walks its steps, keeps every field, and lands on a running plan", async ({ page }) => {
  await signIn(page, "plan-setup", { setup: true, next: "/setup" });

  // Welcome is a standalone screen: the hero title, with no "Set up your plan"
  // header or step list above it.
  await expect(page.getByRole("heading", { name: "Prep that plans your day, then checks it." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Set up your plan" })).toBeHidden();
  await expect(page.locator("body")).not.toContainText(/campaign/i);
  await page.getByRole("button", { name: "Get started" }).click();

  // The desktop header and the 4-dot progress appear once a step is underway.
  await expect(page.getByRole("heading", { name: "Set up your plan" })).toBeVisible();
  await expect(page.getByText("Step 1 of 4", { exact: true })).toBeVisible();
  await expect(page.getByRole("list", { name: "Set up steps" }).getByRole("listitem")).toHaveCount(4);

  // You: name, target role, DSA language.
  await page.getByLabel("Name", { exact: true }).fill("Aman");
  await chip(page, "Target role", "Frontend engineer").click();
  await chip(page, "Language for DSA", "Python").click();
  await page.getByRole("button", { name: "Continue" }).click();

  // Level: three card rows, the same three values Plan uses.
  await expect(page.getByText("Step 2 of 4", { exact: true })).toBeVisible();
  await chip(page, "Your level", "Interview-ready").click();
  await page.getByRole("button", { name: "Continue" }).click();

  // Time: one time-a-day choice, and the level chosen one step back already
  // moves this step's preview.
  await expect(page.getByText("Step 3 of 4", { exact: true })).toBeVisible();
  await expect(week(page)).toContainText("120 min on a weekday, 120 min at the weekend.");
  await expect(week(page)).toContainText("2 problems · 1 review");
  await page.getByRole("button", { name: "30 days" }).click();
  await chip(page, "Time a day", "Hard · 3h").click();
  await expect(week(page)).toContainText("180 min on a weekday, 180 min at the weekend.");
  await expect(page.getByLabel("Time zone")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  // LeetCode is optional and last. The switch is an sr-only checkbox, so the
  // label is what a person clicks.
  await page.getByLabel("LeetCode username (optional, for syncing your solves)").fill("am4nn");
  await page.getByText("I have LeetCode Premium", { exact: true }).click();
  await expect(page.getByLabel("I have LeetCode Premium")).toBeChecked();
  await page.getByRole("button", { name: "Start my plan" }).click();

  // It redirects to Today exactly as it always did, with a plan to work.
  await expect(page).toHaveURL("/today");
  await expect(missions(page)).toBeVisible();

  // And every choice came through: the level, the length and the daily time.
  // Read from Plan rather than from the database, which is what the server saw.
  await page.goto("/me/plan");
  await expect(level(page).getByRole("radio", { name: "Interview-ready" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText(/Day 1 of 30/)).toBeVisible();
  await expect(week(page)).toContainText("180 min on a weekday, 180 min at the weekend.");
});
