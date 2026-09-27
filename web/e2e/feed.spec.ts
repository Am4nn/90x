import { expect, type Page, test } from "@playwright/test";
import { gotoToday, missionRow, signIn } from "./helpers";
import { correctAnswer, LIVE_CARDS, type SeedCard } from "./seed-data";

// Every answer here is graded without AI: exact key-point matches, the output
// card compared as text, and an option pick. CI's model is e2e/fake-model.ts,
// which can't grade.

const cardArticle = (page: Page) => page.getByRole("article");

/** The seeded card the Feed is showing, found by its prompt. */
async function shownCard(page: Page) {
  await expect(page.getByRole("button", { name: "Check", exact: true })).toBeVisible();
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

async function answer(page: Page, card: SeedCard) {
  await page.getByLabel("Your answer", { exact: true }).fill(correctAnswer(card));
  await page.getByRole("button", { name: "Check", exact: true }).click();
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
  "answering a typed card with every key point grades it without AI, then Next card shows another",
  { tag: "@mobile" },
  async ({ page }) => {
    await openFeed(page, "feed");
    const card = await findCard(page, (c) => c.format === "typed");

    await answer(page, card);
    const n = card.keyPoints.length;
    const result = cardArticle(page);
    await expect(result.getByText(`${n} of ${n} key points`, { exact: true })).toBeVisible();
    await expect(result.getByLabel("Covered", { exact: true })).toHaveCount(n);
    await expect(result.getByLabel("Missed", { exact: true })).toHaveCount(0);

    expect((await nextCard(page, card)).id).not.toBe(card.id);
  },
);

test("skipping a card shows its answer", async ({ page }) => {
  await openFeed(page, "feed-skip");
  const card = await findCard(page, (c) => c.format === "typed");

  await cardArticle(page).getByRole("button", { name: "Skip", exact: true }).click();
  const result = cardArticle(page);
  await expect(result.getByText("Skipped", { exact: true })).toBeVisible();
  await expect(result.getByRole("heading", { name: "Answer", exact: true })).toBeVisible();
  await expect(result.getByText(card.answerMd, { exact: true })).toBeVisible();
});

test("picking the right option on the multiple-choice card marks it correct", async ({ page }) => {
  await openFeed(page, "feed-mcq");
  const card = await findCard(page, (c) => c.format === "mcq");
  const right = card.options?.indexOf(card.answerMd) ?? -1;
  expect(right).toBeGreaterThanOrEqual(0);

  await page.getByRole("button", { name: "Show options", exact: true }).click();
  await page.getByRole("list", { name: "Options" }).getByRole("button").nth(right).click();
  await expect(cardArticle(page).getByText("Correct", { exact: true })).toBeVisible();
});

test("reloading mid-card shows the same card", async ({ page }) => {
  const card = await openFeed(page, "feed-reload");
  await page.getByLabel("Your answer", { exact: true }).fill("half an answer");

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
