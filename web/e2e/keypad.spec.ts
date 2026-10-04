import { expect, type Page, test } from "@playwright/test";
import { signIn } from "./helpers";
import { LIVE_CARDS, type SeedCard } from "./seed-data";

// Numeric entry: a keypad, not a text input. The keypad is the input, so a
// native text field would be a regression back to typing.

const cardArticle = (page: Page) => page.getByRole("article");

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

const key = (page: Page, name: string) => page.getByRole("button", { name, exact: true });

test("tapping digits on the keypad builds a number and the right value is correct", { tag: "@mobile" }, async ({ page }) => {
  await openFeed(page, "keypad");
  await findCard(page, (c) => c.primitive === "numeric" && c.value === 16);
  // An exact integer count offers no decimal point.
  await expect(key(page, "Decimal point")).toHaveCount(0);

  await key(page, "1").click();
  await key(page, "6").click();
  await key(page, "Check answer").click();

  await expect(page.getByRole("button", { name: "Next card", exact: true })).toBeVisible();
  await expect(cardArticle(page).getByText("Correct", { exact: true }).first()).toBeVisible();
});

test("an off-by-one value on the keypad marks the card wrong", async ({ page }) => {
  await openFeed(page, "keypad-wrong");
  await findCard(page, (c) => c.primitive === "numeric" && c.value === 16);

  await key(page, "1").click();
  await key(page, "5").click();
  await key(page, "Check answer").click();

  await expect(page.getByRole("button", { name: "Next card", exact: true })).toBeVisible();
  await expect(cardArticle(page).getByText("Not quite", { exact: true })).toBeVisible();
});

test("backspace corrects a mistyped value before submitting", async ({ page }) => {
  await openFeed(page, "keypad-backspace");
  await findCard(page, (c) => c.primitive === "numeric" && c.value === 16);

  await key(page, "1").click();
  await key(page, "6").click();
  await key(page, "9").click();
  await key(page, "Backspace").click();
  await key(page, "Check answer").click();

  await expect(page.getByRole("button", { name: "Next card", exact: true })).toBeVisible();
  await expect(cardArticle(page).getByText("Correct", { exact: true }).first()).toBeVisible();
});

test("the decimal point appears where the card's tolerance implies decimals", async ({ page }) => {
  await openFeed(page, "keypad-decimals");
  await findCard(page, (c) => c.primitive === "numeric" && c.value === 2);

  await expect(key(page, "Decimal point")).toBeVisible();
  await key(page, "1").click();
  await key(page, "Decimal point").click();
  await key(page, "5").click();
  await key(page, "Check answer").click();

  await expect(page.getByRole("button", { name: "Next card", exact: true })).toBeVisible();
  await expect(cardArticle(page).getByText("Correct", { exact: true }).first()).toBeVisible();
});

test("the physical keyboard types and Enter checks", async ({ page }) => {
  await openFeed(page, "keypad-keyboard");
  await findCard(page, (c) => c.primitive === "numeric" && c.value === 16);

  await page.keyboard.type("169");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Enter");

  await expect(page.getByRole("button", { name: "Next card", exact: true })).toBeVisible();
  await expect(cardArticle(page).getByText("Correct", { exact: true }).first()).toBeVisible();
});
