import { expect, type Page, test } from "@playwright/test";
import { signIn } from "./helpers";
import { LIVE_CARDS, type SeedCard } from "./seed-data";

// The why-step: a second screen on the same card, shown only after a correct
// main answer. Both the answer and the reason must be right, or the card is
// wrong. Pinned here so the Gate 3 review sees it when it changes.

const cardArticle = (page: Page) => page.getByRole("article");
const whyQuestion = (page: Page) => page.getByText("Right. Now pick the reason; the card counts only if both are right.", { exact: true });

/** The card on screen, or null when it is another part's card that has not been
 *  merged into the seed yet. */
async function shownCard(page: Page): Promise<SeedCard | null> {
  await expect(page.getByRole("button", { name: "Skip", exact: true })).toBeVisible();
  for (const card of LIVE_CARDS) {
    if (await page.getByText(card.promptMd, { exact: true }).isVisible()) return card;
  }
  return null;
}

async function openFeed(page: Page, name: string) {
  await signIn(page, name, { next: "/feed" });
  await page.getByRole("button", { name: "Skip for now", exact: true }).click();
  await expect(page.getByRole("button", { name: "Skip", exact: true })).toBeVisible();
}

/** Skips the card on screen and returns the next one. */
async function skipTo(page: Page): Promise<SeedCard | null> {
  // Skip goes straight to the next card: no result screen, no answer shown.
  const before = await cardArticle(page).innerText();
  await cardArticle(page).getByRole("button", { name: "Skip", exact: true }).click();
  await expect(cardArticle(page)).not.toHaveText(before);
  return shownCard(page);
}

async function findCard(page: Page, wanted: (card: SeedCard) => boolean) {
  let card = await shownCard(page);
  for (let i = 0; i < 40 && !(card && wanted(card)); i++) card = await skipTo(page);
  if (!card || !wanted(card)) throw new Error("No matching card came up in the queue");
  return card;
}

/** Answers the main question correctly and lands on the why-step. */
/** Types the correct value on the keypad and lands on the why-step. */
async function answerMain(page: Page, card: SeedCard) {
  const value = card.value;
  if (typeof value !== "number") throw new Error("why-step card without a numeric answer");
  for (const digit of String(value)) await page.getByRole("button", { name: digit, exact: true }).click();
  await page.getByRole("button", { name: "Check answer", exact: true }).click();
  await expect(whyQuestion(page)).toBeVisible();
}

test("a correct answer with the right reason marks the card correct", { tag: "@mobile" }, async ({ page }) => {
  await openFeed(page, "why");
  const card = await findCard(page, (c) => c.whyStep !== undefined);
  const why = card.whyStep;
  if (!why) throw new Error("why-step card without a why-step");

  await answerMain(page, card);
  await page.getByRole("list", { name: "Reason" }).getByRole("button").nth(why.correct).click();
  await page.getByRole("button", { name: "Check reason", exact: true }).click();

  await expect(page.getByRole("button", { name: "Next card", exact: true })).toBeVisible();
  await expect(cardArticle(page).getByText("Correct", { exact: true }).first()).toBeVisible();
});

test("a correct answer with the wrong reason marks the card wrong", async ({ page }) => {
  await openFeed(page, "why-wrong");
  const card = await findCard(page, (c) => c.whyStep !== undefined);
  const why = card.whyStep;
  if (!why) throw new Error("why-step card without a why-step");

  await answerMain(page, card);
  const wrong = why.options.findIndex((_, i) => i !== why.correct);
  await page.getByRole("list", { name: "Reason" }).getByRole("button").nth(wrong).click();
  await page.getByRole("button", { name: "Check reason", exact: true }).click();

  await expect(page.getByRole("button", { name: "Next card", exact: true })).toBeVisible();
  await expect(cardArticle(page).getByText("Not quite", { exact: true })).toBeVisible();
});

test("a wrong main answer goes straight to the result, never to the why-step", async ({ page }) => {
  await openFeed(page, "why-main-wrong");
  const card = await findCard(page, (c) => c.whyStep !== undefined);
  const wrongValue = (card.value ?? 0) + 1;

  for (const digit of String(wrongValue)) await page.getByRole("button", { name: digit, exact: true }).click();
  await page.getByRole("button", { name: "Check answer", exact: true }).click();

  await expect(page.getByRole("button", { name: "Next card", exact: true })).toBeVisible();
  await expect(whyQuestion(page)).toHaveCount(0);
  await expect(cardArticle(page).getByText("Not quite", { exact: true })).toBeVisible();
});
