import { expect, type Page, test } from "@playwright/test";
import { gotoToday, missionRow, signIn } from "./helpers";
import { correctOption, LIVE_CARDS, type SeedCard } from "./seed-data";

// Every answer here is graded by a pure function: pick one and self-rate. CI's
// model is e2e/fake-model.ts, which can't grade, and none of these paths call it.

const cardArticle = (page: Page) => page.getByRole("article");

/** The primitives the generic `answer` helper can grade in one tap. The
 *  mapping and ordering screens (order, match, bucket, assemble, claim grid)
 *  need several taps, so the mission test skips them rather than answer them. */
const ANSWERABLE = new Set(["pick_one", "self_rate", "tap_in_place"]);

/** The seeded card the Feed is showing, found by its prompt. */
async function shownCard(page: Page) {
  await expect(page.getByRole("button", { name: "Skip", exact: true })).toBeVisible();
  for (const card of LIVE_CARDS) {
    if (await page.getByText(card.promptMd, { exact: true }).isVisible()) return card;
  }
  throw new Error("The Feed is showing a card that isn't in the e2e seed");
}

/** Sign in on the Feed as a new user and skip the diagnostic it offers first. */
async function openFeed(page: Page, name: string) {
  await signIn(page, name, { next: "/feed" });
  await page.getByRole("button", { name: "Skip for now", exact: true }).click();
  return shownCard(page);
}

/** After a Skip the next card is already on screen: no result to click through. */
async function afterSkip(page: Page, card: SeedCard) {
  await expect(page.getByText(card.promptMd, { exact: true })).toHaveCount(0);
  return shownCard(page);
}

/** From a card's result, go on and return the card that replaces it. */
async function nextCard(page: Page, card: SeedCard) {
  await page.getByRole("button", { name: "Next card", exact: true }).click();
  await expect(page.getByText(card.promptMd, { exact: true })).toHaveCount(0);
  return shownCard(page);
}

/** Answers the card correctly: the right option for pick one, "Got it" for self-rate. */
async function answer(page: Page, card: SeedCard) {
  if (card.primitive === "self_rate") {
    await page.getByRole("button", { name: "Got it", exact: true }).click();
  } else {
    const right = correctOption(card);
    expect(right).toBeGreaterThanOrEqual(0);
    await page.getByRole("list", { name: "Options" }).getByRole("button").nth(right).click();
    await page.getByRole("button", { name: "Check answer", exact: true }).click();
  }
  await expect(page.getByRole("button", { name: "Next card", exact: true })).toBeVisible();
}

/** Skips cards until one matching `wanted` is on screen. A fresh queue holds every seeded card. */
async function findCard(page: Page, wanted: (card: SeedCard) => boolean) {
  let card = await shownCard(page);
  for (let i = 0; i < LIVE_CARDS.length && !wanted(card); i++) {
    await cardArticle(page).getByRole("button", { name: "Skip", exact: true }).click();
    card = await afterSkip(page, card);
  }
  if (!wanted(card)) throw new Error("No matching card came up in the queue");
  return card;
}

test(
  "answering a pick-one card with the right option grades it without AI, then Next card shows another",
  { tag: "@mobile" },
  async ({ page }) => {
    await openFeed(page, "feed");
    const card = await findCard(page, (c) => c.primitive === "pick_one");

    await answer(page, card);
    const result = cardArticle(page);
    await expect(result.getByText("Correct", { exact: true }).first()).toBeVisible();

    expect((await nextCard(page, card)).id).not.toBe(card.id);
  },
);

test("after an answer the footer takes a star rating and a report, and not before", async ({ page }) => {
  await openFeed(page, "feed-footer");
  const card = await findCard(page, (c) => c.primitive === "pick_one");
  const footer = page.getByRole("region", { name: "About this card" });
  await expect(footer).toHaveCount(0);

  await answer(page, card);
  await expect(footer).toBeVisible();

  const rating = footer.getByRole("group", { name: "Rate this card" });
  await rating.getByRole("button", { name: "4 of 5, Good" }).click();
  await expect(rating.getByRole("button", { name: "4 of 5, Good" })).toHaveAttribute("aria-pressed", "true");
  await rating.getByRole("button", { name: "4 of 5, Good" }).click();
  await expect(rating.getByRole("button", { name: "4 of 5, Good" })).toHaveAttribute("aria-pressed", "false");

  await footer.getByRole("button", { name: "Report", exact: true }).click();
  await footer.getByRole("textbox", { name: "What's wrong with this card?" }).fill("The wording is unclear.");
  await footer.getByRole("button", { name: "Send", exact: true }).click();
  await expect(footer.getByText("Report sent. This card will be reviewed.")).toBeVisible();
});

test("the filters pill sets difficulty and topics, and they survive a reload", { tag: "@mobile" }, async ({ page }) => {
  await openFeed(page, "filters");
  await page.getByRole("button", { name: "All topics · Standard" }).click();

  await page.getByRole("radio", { name: "Harder", exact: true }).click();
  await page.getByRole("button", { name: "AI", exact: true }).click();
  // The pill changes at once; a reload before the save lands would drop it.
  await expect(page.getByText("Saving…")).toHaveCount(0);

  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByRole("button", { name: "7 topics · Harder" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "7 topics · Harder" })).toBeVisible();
});

test("the Today block opens an overall report with lifetime, areas and seven days", async ({ page }) => {
  await openFeed(page, "feed-report");
  const card = await findCard(page, (c) => c.primitive === "pick_one");
  await answer(page, card);

  const today = page.getByRole("region", { name: "Today" }).first();
  await today.getByRole("button", { name: "Overall report" }).click();
  await expect(today.getByRole("heading", { name: "Lifetime" })).toBeVisible({ timeout: 20_000 });
  await expect(today.getByRole("heading", { name: "By area" })).toBeVisible();
  await expect(today.getByRole("heading", { name: "Last 7 days, correct" })).toBeVisible();
  await today.getByRole("button", { name: "Hide report" }).click();
  await expect(today.getByRole("heading", { name: "Lifetime" })).toHaveCount(0);
});

test(
  "on a phone the side blocks follow the answer and nothing covers the Next card bar",
  { tag: "@mobile" },
  async ({ page, isMobile }) => {
    test.skip(!isMobile, "The side blocks move below the card only on a phone");
    await openFeed(page, "feed-mobile-blocks");
    const card = await findCard(page, (c) => c.primitive === "pick_one");
    await expect(page.getByRole("region", { name: "Why this card" })).toHaveCount(0);

    await answer(page, card);
    await expect(page.getByRole("region", { name: "Today" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Why this card" })).toBeVisible();

    const next = page.getByRole("button", { name: "Next card", exact: true });
    const nav = page.getByRole("navigation", { name: "Main" });
    const [nextBox, navBox] = [await next.boundingBox(), await nav.boundingBox()];
    expect(nextBox && navBox && nextBox.y + nextBox.height <= navBox.y).toBe(true);
  },
);

test("picking the wrong option on a pick-one card marks it wrong", async ({ page }) => {
  await openFeed(page, "feed-wrong");
  const card = await findCard(page, (c) => c.primitive === "pick_one");
  const right = correctOption(card);
  const wrong = card.options ? card.options.findIndex((_, i) => i !== right) : -1;
  expect(wrong).toBeGreaterThanOrEqual(0);

  await page.getByRole("list", { name: "Options" }).getByRole("button").nth(wrong).click();
  await page.getByRole("button", { name: "Check answer", exact: true }).click();
  await expect(page.getByRole("button", { name: "Next card", exact: true })).toBeVisible();
  await expect(cardArticle(page).getByText("Not quite", { exact: true })).toBeVisible();
});

test("a self-rate card marked got counts as correct", async ({ page }) => {
  await openFeed(page, "feed-self-rate");
  const card = await findCard(page, (c) => c.primitive === "self_rate");

  await page.getByRole("button", { name: "Got it", exact: true }).click();
  await expect(page.getByRole("button", { name: "Next card", exact: true })).toBeVisible();
  await expect(cardArticle(page).getByText("Correct", { exact: true }).first()).toBeVisible();
  await expect(cardArticle(page).getByText(card.answerMd, { exact: true })).toBeVisible();
});

test("skipping a card moves on without showing its answer", async ({ page }) => {
  await openFeed(page, "feed-skip");
  const card = await shownCard(page);

  await cardArticle(page).getByRole("button", { name: "Skip", exact: true }).click();
  const next = await afterSkip(page, card);
  expect(next.id).not.toBe(card.id);
  await expect(page.getByText(card.answerMd, { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Answer", exact: true })).toHaveCount(0);
});

test("reloading mid-card shows the same card", async ({ page }) => {
  const card = await openFeed(page, "feed-reload");

  await page.reload();
  expect((await shownCard(page)).id).toBe(card.id);
});

test("answering 10 cards in the Feed ticks Today's cards mission", async ({ page }) => {
  test.slow();
  await signIn(page, "feed-mission", { cards: true });
  await expect(missionRow(page, "10 cards").getByLabel("Open", { exact: true })).toBeVisible();

  await page.goto("/feed");
  await page.getByRole("button", { name: "Skip for now", exact: true }).click();
  let card = await shownCard(page);
  let answered = 0;
  while (answered < 10) {
    // Cards the generic answer() cannot grade are skipped, so the mission still
    // counts ten real answers rather than failing on a multi-tap screen.
    if (!ANSWERABLE.has(card.primitive)) {
      await cardArticle(page).getByRole("button", { name: "Skip", exact: true }).click();
      card = await afterSkip(page, card);
      continue;
    }
    await answer(page, card);
    answered += 1;
    if (answered < 10) card = await nextCard(page, card);
  }

  await gotoToday(page);
  await expect(missionRow(page, "10 cards").getByLabel("Done", { exact: true })).toBeVisible();
});

test('"New to me" shows the answer without scoring the card', async ({ page }) => {
  await openFeed(page, "feed-declare");
  const card = await shownCard(page);

  await cardArticle(page).getByRole("button", { name: "New to me", exact: true }).click();

  const result = cardArticle(page);
  await expect(result.getByText("New to you — here's the answer", { exact: true })).toBeVisible();
  await expect(result.getByText(card.answerMd, { exact: true })).toBeVisible();
  // No score: a declaration says nothing about how well the reader knows this,
  // so showing a percentage would be inventing one.
  await expect(result.getByText("%", { exact: false })).toHaveCount(0);
});

test('"I already know this" is hidden until the topic has been answered', async ({ page }) => {
  await openFeed(page, "feed-known");

  // It is earned, and a fresh reader has answered nothing yet.
  await expect(cardArticle(page).getByRole("button", { name: "I already know this" })).toHaveCount(0);
});

test("an answered card is not served again after navigating away", async ({ page }) => {
  // Reported from production: a self-rated card was marked wrong, and one
  // navigation later it was asking "Missed it / Got it" again — still labelled
  // "New card", because the reason is written into the queue entry in Redis and
  // does not know the answer has since landed in Postgres. `nextCard` checked a
  // queued card was live and in area, not that it was unanswered.
  const card = await openFeed(page, "feed-answered-once");

  await cardArticle(page).getByRole("button", { name: "Skip", exact: true }).click();
  await afterSkip(page, card);

  // Away and back, the way a reader moves around the app.
  await gotoToday(page);
  await page.goto("/feed");

  const next = await shownCard(page);
  expect(next.id).not.toBe(card.id);
});
