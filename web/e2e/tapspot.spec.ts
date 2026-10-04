import { expect, type Page, test } from "@playwright/test";
import { signIn } from "./helpers";
import { correctOption, LIVE_CARDS, type SeedCard } from "./seed-data";

// Tap-in-place and self-rate. Tap-in-place submits on tap, so a correct tap
// grades immediately; a wrong tap highlights the correct line in the result.

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

/** Skips until a card matching `wanted` is on screen. A fresh queue holds every seeded card. */
async function findCard(page: Page, wanted: (card: SeedCard) => boolean) {
  let card = await shownCard(page);
  for (let i = 0; i < LIVE_CARDS.length && !wanted(card); i++) {
    await cardArticle(page).getByRole("button", { name: "Skip", exact: true }).click();
    card = await afterSkip(page, card);
  }
  if (!wanted(card)) throw new Error("No matching card came up in the queue");
  return card;
}

/** The tappable line targets in the snippet, in order. */
const lineTarget = (page: Page, index: number) => page.getByRole("list", { name: "Options" }).getByRole("button").nth(index);

test("tapping the correct line in a snippet grades it right and shows the answer", async ({ page }) => {
  await openFeed(page, "tapspot");
  const card = await findCard(page, (c) => c.primitive === "tap_in_place");
  const right = correctOption(card);
  expect(right).toBeGreaterThanOrEqual(0);

  await lineTarget(page, right).click();
  await cardArticle(page).getByRole("button", { name: "Check answer", exact: true }).click();
  await expect(page.getByRole("button", { name: "Next card", exact: true })).toBeVisible();
  await expect(cardArticle(page).getByText("Correct", { exact: true }).first()).toBeVisible();
  await expect(cardArticle(page).getByText(card.answerMd, { exact: true })).toBeVisible();
});

test("tapping a wrong line marks it wrong and highlights the correct one", async ({ page }) => {
  await openFeed(page, "tapspot-wrong");
  const card = await findCard(page, (c) => c.primitive === "tap_in_place");
  const right = correctOption(card);
  const wrong = (card.options ?? []).findIndex((_, index) => index !== right);
  expect(wrong).toBeGreaterThanOrEqual(0);

  await lineTarget(page, wrong).click();
  await cardArticle(page).getByRole("button", { name: "Check answer", exact: true }).click();
  await expect(page.getByRole("button", { name: "Next card", exact: true })).toBeVisible();
  await expect(cardArticle(page).getByText("Not quite", { exact: true })).toBeVisible();
  // The result bars the correct line with its explanation and tags the wrong pick.
  await expect(cardArticle(page).getByText(`Line ${right + 1}`)).toBeVisible();
  await expect(cardArticle(page).getByText("Your pick", { exact: true })).toBeVisible();
});

test("the snippet targets are keyboard-reachable: Tab to the line, Enter picks it, Check answer submits", async ({ page }) => {
  await openFeed(page, "tapspot-keyboard");
  const card = await findCard(page, (c) => c.primitive === "tap_in_place");
  const right = correctOption(card);
  expect(right).toBeGreaterThanOrEqual(0);

  await lineTarget(page, 0).focus();
  for (let i = 1; i <= right; i++) await page.keyboard.press("Tab");
  await expect(lineTarget(page, right)).toBeFocused();

  await page.keyboard.press("Enter");
  await cardArticle(page).getByRole("button", { name: "Check answer", exact: true }).click();
  await expect(page.getByRole("button", { name: "Next card", exact: true })).toBeVisible();
  await expect(cardArticle(page).getByText("Correct", { exact: true }).first()).toBeVisible();
});

test("self-rate Got it records a correct and moves to the next card", async ({ page }) => {
  await openFeed(page, "tapspot-self-got");
  const card = await findCard(page, (c) => c.primitive === "self_rate");

  await page.getByRole("button", { name: "Got it", exact: true }).click();
  await expect(page.getByRole("button", { name: "Next card", exact: true })).toBeVisible();
  await expect(cardArticle(page).getByText("Correct", { exact: true }).first()).toBeVisible();

  expect((await nextCard(page, card)).id).not.toBe(card.id);
});

test("self-rate Missed it records a wrong and moves to the next card", async ({ page }) => {
  await openFeed(page, "tapspot-self-missed");
  const card = await findCard(page, (c) => c.primitive === "self_rate");

  await page.getByRole("button", { name: "Missed it", exact: true }).click();
  await expect(page.getByRole("button", { name: "Next card", exact: true })).toBeVisible();
  await expect(cardArticle(page).getByText("Not quite", { exact: true })).toBeVisible();

  expect((await nextCard(page, card)).id).not.toBe(card.id);
});
