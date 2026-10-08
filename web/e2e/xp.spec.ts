import { expect, type Page, test } from "@playwright/test";
import { finishOne, gotoToday, openFeedCard, openMissions, seededCard, signIn } from "./helpers";
import { correctOption } from "./seed-data";

// XP. Every card here is graded by a pure function, so no model runs: a
// right pick-one earns the rule-graded 2. The amounts are the plain numbers the
// reader sees; the caps and the once-a-day rule have unit tests, because
// reaching them takes dozens of answers.

/** Opens the Feed as a new user and answers a pick-one card correctly. */
async function answerRuleCard(page: Page, name: string) {
  const card = seededCard((c) => c.primitive === "pick_one" && c.difficulty === "Easy" && !c.whyStep, "easy pick-one");
  await openFeedCard(page, name, card.promptMd);
  await page.getByRole("list", { name: "Options" }).getByRole("button").nth(correctOption(card)).click();
  await page.getByRole("button", { name: "Check answer", exact: true }).click();
  await expect(page.getByRole("button", { name: "Next card", exact: true })).toBeVisible();
}

test("a correct rule-graded card shows +2 XP on its result", async ({ page }) => {
  await answerRuleCard(page, "xp-card");
  await expect(page.getByText("+2 XP", { exact: true })).toBeVisible();
});

test("finishing the day's missions shows what each earned and the day bonus, and Today adds it up", async ({ page }) => {
  await signIn(page, "xp-day");
  await gotoToday(page);
  // Nothing earned yet: the day line says nothing about XP.
  await expect(page.getByTestId("xp-today")).toHaveCount(0);
  const planned = await openMissions(page).count();
  expect(planned).toBeGreaterThan(0);

  let earned = 0;
  for (let i = 0; i < planned; i++) {
    await gotoToday(page);
    const href = (await openMissions(page).first().getByRole("link").getAttribute("href")) ?? "";
    await finishOne(page);
    // A new problem solved is 30 and a topic studied is 20, said where it happened.
    const xp = href.startsWith("/library/problem/") ? 30 : href.startsWith("/library/topic/") ? 20 : 0;
    earned += xp;
    if (xp) await expect(page.getByText(`+${xp} XP`, { exact: true })).toBeVisible();
  }
  // The action that finished the day says so.
  await expect(page.getByText("+20 XP for finishing the day", { exact: true })).toBeVisible();

  await gotoToday(page);
  await expect(page.getByText("Day done. The square is yours.")).toBeVisible();
  await expect(page.getByTestId("xp-today")).toHaveText(`${earned + 20} XP today`);
});

test("Today counts the card's XP and Me shows the total and this week's chart, Monday to Sunday", async ({ page }) => {
  await answerRuleCard(page, "xp-me");

  await gotoToday(page);
  await expect(page.getByTestId("xp-today")).toHaveText("2 XP today");

  await page.goto("/me");
  const xp = page.getByRole("region", { name: "XP" });
  await expect(xp.getByTestId("xp-total")).toHaveText("2");
  await expect(xp.getByText("XP in total")).toBeVisible();
  const days = xp.getByRole("list", { name: "XP, this week" }).getByRole("listitem");
  await expect(days).toHaveCount(7);
  await expect(days.first()).toContainText("Mon");
  await expect(xp.getByText("2 this week")).toBeVisible();
  // A quiet day prints no "0" over its empty bar.
  await expect(days.getByText("0", { exact: true })).toHaveCount(6);
  for (const zero of await days.getByText("0", { exact: true }).all()) await expect(zero).toBeHidden();
  // A screen reader still hears each day's value.
  await expect(days.filter({ hasText: /0 XP|not yet/ })).toHaveCount(6);
});
