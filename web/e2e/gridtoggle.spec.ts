import { expect, type Page, test } from "@playwright/test";
import { signIn } from "./helpers";
import { LIVE_CARDS, type SeedCard } from "./seed-data";

// Grid toggle: a structures x operations matrix, capped at 3x3. Each ticked
// cell is one key in a chosen set.

const SIZE = 3;
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
  await cardArticle(page).getByRole("button", { name: "Skip", exact: true }).click();
  await expect(page.getByRole("button", { name: "Next card", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next card", exact: true }).click();
  return shownCard(page);
}

async function findCard(page: Page, wanted: (card: SeedCard) => boolean) {
  let card = await shownCard(page);
  for (let i = 0; i < 40 && !(card && wanted(card)); i++) card = await skipTo(page);
  if (!card || !wanted(card)) throw new Error("No matching card came up in the queue");
  return card;
}

/** The aria-label of a grid cell: "<structure>, <operation>". */
function cellName(card: SeedCard, cell: number) {
  const options = card.options ?? [];
  const structure = options[Math.floor(cell / SIZE)];
  const operation = options[SIZE + (cell % SIZE)];
  return `${structure}, ${operation}`;
}

const cell = (page: Page, name: string) => page.getByRole("button", { name, exact: true });

test("ticking the correct cells marks the grid correct", { tag: "@mobile" }, async ({ page }) => {
  await openFeed(page, "grid");
  const card = await findCard(page, (c) => c.primitive === "grid_toggle");

  for (const index of card.picked ?? []) await cell(page, cellName(card, index)).click();
  await page.getByRole("button", { name: "Check", exact: true }).click();

  await expect(page.getByRole("button", { name: "Next card", exact: true })).toBeVisible();
  await expect(cardArticle(page).getByText("Correct", { exact: true })).toBeVisible();
});

test("one extra wrong cell marks the grid wrong", async ({ page }) => {
  await openFeed(page, "grid-wrong");
  const card = await findCard(page, (c) => c.primitive === "grid_toggle");

  const correct = new Set(card.picked ?? []);
  for (const index of card.picked ?? []) await cell(page, cellName(card, index)).click();
  const wrong = Array.from({ length: SIZE * SIZE }, (_, i) => i).find((i) => !correct.has(i));
  if (wrong === undefined) throw new Error("no wrong cell to tick");
  await cell(page, cellName(card, wrong)).click();
  await page.getByRole("button", { name: "Check", exact: true }).click();

  await expect(page.getByRole("button", { name: "Next card", exact: true })).toBeVisible();
  await expect(cardArticle(page).getByText("Not quite", { exact: true })).toBeVisible();
});

test("re-tapping a ticked cell untickes it", async ({ page }) => {
  await openFeed(page, "grid-untick");
  const card = await findCard(page, (c) => c.primitive === "grid_toggle");

  const first = card.picked?.[0];
  if (first === undefined) throw new Error("no correct cell");
  const target = cell(page, cellName(card, first));
  await target.click();
  await expect(target).toHaveAttribute("aria-pressed", "true");
  await target.click();
  await expect(target).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("button", { name: "Check", exact: true })).toBeDisabled();
});
