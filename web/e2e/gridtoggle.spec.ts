import { expect, type Page, test } from "@playwright/test";
import { signIn } from "./helpers";
import { LIVE_CARDS, type SeedCard } from "./seed-data";

// Grid toggle: a structures x operations matrix, capped at 3x3. Each ticked
// cell is one key in a chosen set.

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

/** The aria-label of a grid cell: "<row>, <column>", row-major. */
function cellName(card: SeedCard, cell: number) {
  const columns = card.columns ?? [];
  const structure = card.rows?.[Math.floor(cell / columns.length)] ?? "";
  const operation = columns[cell % columns.length] ?? "";
  return `${structure}, ${operation}`;
}

const cell = (page: Page, name: string) => page.getByRole("button", { name, exact: true });

test("ticking the correct cells marks the grid correct", { tag: "@mobile" }, async ({ page }) => {
  await openFeed(page, "grid");
  const card = await findCard(page, (c) => c.primitive === "grid_toggle");

  for (const index of card.picked ?? []) await cell(page, cellName(card, index)).click();
  await page.getByRole("button", { name: "Check answer", exact: true }).click();

  await expect(page.getByRole("button", { name: "Next card", exact: true })).toBeVisible();
  await expect(cardArticle(page).getByText("Correct", { exact: true }).first()).toBeVisible();
});

test("one extra wrong cell marks the grid wrong", async ({ page }) => {
  await openFeed(page, "grid-wrong");
  const card = await findCard(page, (c) => c.primitive === "grid_toggle");

  const correct = new Set(card.picked ?? []);
  for (const index of card.picked ?? []) await cell(page, cellName(card, index)).click();
  const cells = (card.rows?.length ?? 0) * (card.columns?.length ?? 0);
  const wrong = Array.from({ length: cells }, (_, i) => i).find((i) => !correct.has(i));
  if (wrong === undefined) throw new Error("no wrong cell to tick");
  await cell(page, cellName(card, wrong)).click();
  await page.getByRole("button", { name: "Check answer", exact: true }).click();

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
  await expect(page.getByRole("button", { name: "Check answer", exact: true })).toBeDisabled();
});

test("long column names wrap inside their own column, on a phone too", { tag: "@mobile" }, async ({ page }) => {
  await openFeed(page, "grid-long");
  await findCard(page, (c) => c.primitive === "grid_toggle");

  // The seeded names are short; real cards carry whole clauses. Swap in three, as long as
  // a live Java card's, and check every name stays inside its column and clear of the next.
  const headers = page.getByRole("group", { name: "Answer grid" }).locator("> div").first().locator("span");
  const boxes = await headers.evaluateAll((spans) => {
    const long = [
      "Allows concurrent reads without locking",
      "Iterators are weakly consistent",
      "Each write copies the entire underlying array",
    ];
    spans.forEach((span, i) => (span.textContent = long[i % long.length]!));
    return spans.map((span) => {
      const box = span.getBoundingClientRect();
      return { left: box.left, right: box.right, overflows: span.scrollWidth > span.clientWidth + 1 };
    });
  });
  expect(boxes.length).toBeGreaterThan(1);
  for (const box of boxes) expect(box.overflows).toBe(false);
  for (let i = 1; i < boxes.length; i++) expect(boxes[i]!.left).toBeGreaterThanOrEqual(boxes[i - 1]!.right - 0.5);
});
