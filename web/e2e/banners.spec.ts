import { expect, type Page, test } from "@playwright/test";
import { signIn } from "./helpers";
import { correctOption, LIVE_CARDS, type SeedCard } from "./seed-data";

// The two banners that close: Today's "You missed <date>." and the Feed's "Your
// missions are waiting." Both remember on the device (localStorage), so the cases
// that matter are the memory itself: it survives a reload, and it does not hide
// the next thing that deserves to show.
//
// The states come from the test sign-in route, because both depend on today's
// date: `missed` starts the plan two days back (Today then closes the two days
// as missed), and `answered` writes that many answered cards for today.

// The plan runs on UTC days (the sign-in route sets that), and the Feed banner's
// memory is the browser's local day: make them the same day wherever this runs.
test.use({ timezoneId: "UTC" });

const REVIVE_KEY = "90x:revive-closed";
const SEEN_KEY = "90x:mission-banner-seen";

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const stored = (page: Page, key: string) => page.evaluate((k) => localStorage.getItem(k), key);

// The banner says the day as the app writes dates ("Oct 6"); the stored memory keeps the ISO date.
const shown = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const revive = (page: Page, date: string) => page.getByText(`You missed ${shown(date)}.`);
const waiting = (page: Page) => page.getByText("Your missions are waiting.");

test("the revive banner closes with the x, stays closed after a reload, and a newer missed day shows again", async ({ page }) => {
  await signIn(page, "banner-revive", { missed: true });
  const yesterday = day(-1);
  await expect(revive(page, yesterday)).toBeVisible();

  await page.getByRole("button", { name: "Hide" }).click();
  await expect(revive(page, yesterday)).toBeHidden();
  expect(await stored(page, REVIVE_KEY)).toBe(yesterday);

  await page.reload();
  await expect(page.getByRole("heading", { name: "Missions" })).toBeVisible();
  await expect(revive(page, yesterday)).toHaveCount(0);

  // Closed for an older day: yesterday is newer than what was hidden, so it shows.
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), { key: REVIVE_KEY, value: day(-2) });
  await page.reload();
  await expect(revive(page, yesterday)).toBeVisible();
});

/** The seeded card the Feed is showing, found by its prompt. */
async function shownCard(page: Page) {
  await expect(page.getByRole("button", { name: "Skip", exact: true })).toBeVisible();
  for (const card of LIVE_CARDS) {
    if (await page.getByText(card.promptMd, { exact: true }).isVisible()) return card;
  }
  throw new Error("The Feed is showing a card that isn't in the e2e seed");
}

/** Today plans the missions (the Feed counts the open ones), then the Feed with its diagnostic skipped. */
async function openFeed(page: Page) {
  await signIn(page, "banner-feed", { cards: true, answered: 20 });
  await page.goto("/feed");
  await page.getByRole("button", { name: "Skip for now", exact: true }).click();
  await shownCard(page);
}

/** Skips on until a pick-one card is up, then answers it with the right option. */
async function answerOne(page: Page) {
  let card: SeedCard = await shownCard(page);
  for (let i = 0; i < LIVE_CARDS.length && card.primitive !== "pick_one"; i++) {
    await page.getByRole("article").getByRole("button", { name: "Skip", exact: true }).click();
    await expect(page.getByText(card.promptMd, { exact: true })).toHaveCount(0);
    card = await shownCard(page);
  }
  expect(card.primitive).toBe("pick_one");
  await page.getByRole("list", { name: "Options" }).getByRole("button").nth(correctOption(card)).click();
  await page.getByRole("button", { name: "Check answer", exact: true }).click();
  await expect(page.getByRole("button", { name: "Next card", exact: true })).toBeVisible();
}

test("the missions banner shows at 20 answers, goes on the next answer, and does not return the same day", async ({ page }) => {
  await openFeed(page);
  await expect(page.getByText("You've done 20 cards. Your missions are waiting.")).toBeVisible();
  expect(await stored(page, SEEN_KEY)).toBe(day(0));

  await answerOne(page);
  await expect(waiting(page)).toBeHidden();

  // Away and back: seen today, so it stays away even though the threshold still holds.
  await page.goto("/today");
  await expect(page.getByRole("heading", { name: "Missions" })).toBeVisible();
  await page.goto("/feed");
  await shownCard(page);
  await expect(waiting(page)).toHaveCount(0);
});

test("the missions banner closes at once with the x", async ({ page }) => {
  await openFeed(page);
  await expect(waiting(page)).toBeVisible();
  await page.getByRole("button", { name: "Hide" }).click();
  await expect(waiting(page)).toBeHidden();
  expect(await stored(page, SEEN_KEY)).toBe(day(0));
});
