import { expect, type Page, test } from "@playwright/test";
import { feedCard, openFeedCard, seededCard } from "./helpers";

const pool = (page: Page) => page.getByRole("list", { name: "Items to place" });

test("placing items in the right order is correct and explains the order", async ({ page }) => {
  const card = seededCard((c) => c.primitive === "order", "order");
  await openFeedCard(page, "ordering-correct", card.promptMd);

  for (const item of card.options ?? []) {
    await pool(page).getByRole("button", { name: item, exact: true }).click();
  }
  await feedCard(page).getByRole("button", { name: "Check answer", exact: true }).click();

  await expect(feedCard(page).getByText("Correct", { exact: true }).first()).toBeVisible();
  await expect(feedCard(page).getByText(card.answerMd, { exact: true })).toBeVisible();
});

test("two items swapped is wrong", async ({ page }) => {
  const card = seededCard((c) => c.primitive === "order", "order");
  await openFeedCard(page, "ordering-swapped", card.promptMd);

  // Swap the middle two steps of the cache-aside read.
  const swapped = ["Read the cache", "Write the value back to the cache", "On a miss, read the store", "Return the value"];
  for (const item of swapped) {
    await pool(page).getByRole("button", { name: item, exact: true }).click();
  }
  await feedCard(page).getByRole("button", { name: "Check answer", exact: true }).click();

  await expect(feedCard(page).getByText("Not quite", { exact: true })).toBeVisible();
});

test("a placed item can be sent back to the pool", async ({ page }) => {
  const card = seededCard((c) => c.primitive === "order", "order");
  await openFeedCard(page, "ordering-undo", card.promptMd);

  await pool(page).getByRole("button", { name: "Read the cache", exact: true }).click();
  await feedCard(page).getByRole("button", { name: "Remove Read the cache from the order", exact: true }).click();

  // Back in the pool, so the answer is incomplete and Check stays disabled.
  await expect(pool(page).getByRole("button", { name: "Read the cache", exact: true })).toBeVisible();
  await expect(feedCard(page).getByRole("button", { name: "Check answer", exact: true })).toBeDisabled();
});
