import { expect, type Page, test } from "@playwright/test";
import { gotoToday, missionRow, signIn } from "./helpers";
import { correctOption, LIVE_CARDS, type SeedCard } from "./seed-data";

// Every answer here is graded by a pure function: pick one and self-rate. CI's
// model is e2e/fake-model.ts, which can't grade, and none of these paths call it.

const cardArticle = (page: Page) => page.getByRole("article");

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
  }
  await expect(page.getByRole("button", { name: "Next card", exact: true })).toBeVisible();
}

/** Skips cards until one matching `wanted` is on screen. A fresh queue holds every seeded card. */
async function findCard(page: Page, wanted: (card: SeedCard) => boolean) {
  let card = await shownCard(page);
  for (let i = 0; i < LIVE_CARDS.length && !wanted(card); i++) {
    await cardArticle(page).getByRole("button", { name: "Skip", exact: true }).click();
    card = await nextCard(page, card);
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
    await expect(result.getByText("Correct", { exact: true })).toBeVisible();

    expect((await nextCard(page, card)).id).not.toBe(card.id);
  },
);

test("picking the wrong option on a pick-one card marks it wrong", async ({ page }) => {
  await openFeed(page, "feed-wrong");
  const card = await findCard(page, (c) => c.primitive === "pick_one");
  const right = correctOption(card);
  const wrong = card.options ? card.options.findIndex((_, i) => i !== right) : -1;
  expect(wrong).toBeGreaterThanOrEqual(0);

  await page.getByRole("list", { name: "Options" }).getByRole("button").nth(wrong).click();
  await expect(page.getByRole("button", { name: "Next card", exact: true })).toBeVisible();
  await expect(cardArticle(page).getByText("Not quite", { exact: true })).toBeVisible();
});

test("a self-rate card marked got counts as correct", async ({ page }) => {
  await openFeed(page, "feed-self-rate");
  const card = await findCard(page, (c) => c.primitive === "self_rate");

  await page.getByRole("button", { name: "Got it", exact: true }).click();
  await expect(page.getByRole("button", { name: "Next card", exact: true })).toBeVisible();
  await expect(cardArticle(page).getByText("Correct", { exact: true })).toBeVisible();
  await expect(cardArticle(page).getByText(card.answerMd, { exact: true })).toBeVisible();
});

test("skipping a card shows its answer", async ({ page }) => {
  await openFeed(page, "feed-skip");
  const card = await shownCard(page);

  await cardArticle(page).getByRole("button", { name: "Skip", exact: true }).click();
  const result = cardArticle(page);
  await expect(result.getByText("Skipped", { exact: true })).toBeVisible();
  await expect(result.getByRole("heading", { name: "Answer", exact: true })).toBeVisible();
  await expect(result.getByText(card.answerMd, { exact: true })).toBeVisible();
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
  for (let answered = 1; answered <= 10; answered++) {
    await answer(page, card);
    if (answered < 10) card = await nextCard(page, card);
  }

  await gotoToday(page);
  await expect(missionRow(page, "10 cards").getByLabel("Done", { exact: true })).toBeVisible();
});

test('"New to me" shows the answer without scoring the card', async ({ page }) => {
  await openFeed(page, "feed-declare");
  const card = await shownCard(page);

  await cardArticle(page).getByRole("button", { name: "New to me — show me the answer" }).click();

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
