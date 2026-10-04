import { expect, type Page, test } from "@playwright/test";
import { feedCard, openFeedCard, seededCard } from "./helpers";

const terms = (page: Page) => page.getByRole("list", { name: "Terms" });
const meanings = (page: Page) => page.getByRole("list", { name: "Meanings" });

/** Arms `term`, then locks it to `meaning`. */
async function pair(page: Page, term: string, meaning: string) {
  await terms(page).getByRole("button", { name: term, exact: true }).click();
  await meanings(page).getByRole("button", { name: meaning, exact: true }).click();
}

test("matching every pair correctly is correct", async ({ page }) => {
  const card = seededCard((c) => c.primitive === "match", "match");
  await openFeedCard(page, "pairing-correct", card.promptMd);

  await pair(page, "ConcurrentModificationException", "Mutating a collection while iterating");
  await pair(page, "NullPointerException", "Calling into null");
  await pair(page, "ClassCastException", "Casting to an unrelated type");
  await feedCard(page).getByRole("button", { name: "Check answer", exact: true }).click();

  await expect(feedCard(page).getByText("Correct", { exact: true }).first()).toBeVisible();
});

test("one wrong pair is wrong", async ({ page }) => {
  const card = seededCard((c) => c.primitive === "match", "match");
  await openFeedCard(page, "pairing-wrong", card.promptMd);

  await pair(page, "ConcurrentModificationException", "Mutating a collection while iterating");
  await pair(page, "NullPointerException", "Casting to an unrelated type"); // wrong
  await pair(page, "ClassCastException", "Calling into null"); // wrong
  await feedCard(page).getByRole("button", { name: "Check answer", exact: true }).click();

  await expect(feedCard(page).getByText("Not quite", { exact: true })).toBeVisible();
});

test("a locked pair can be unlocked and re-matched", async ({ page }) => {
  const card = seededCard((c) => c.primitive === "match", "match");
  await openFeedCard(page, "pairing-rematch", card.promptMd);

  await pair(page, "ConcurrentModificationException", "Calling into null"); // wrong, then fixed
  // Unlock by tapping the term again; it returns to the armed pool.
  await terms(page)
    .getByRole("button", { name: /ConcurrentModificationException/ })
    .click();
  await meanings(page).getByRole("button", { name: "Mutating a collection while iterating", exact: true }).click();

  await pair(page, "NullPointerException", "Calling into null");
  await pair(page, "ClassCastException", "Casting to an unrelated type");
  await feedCard(page).getByRole("button", { name: "Check answer", exact: true }).click();

  await expect(feedCard(page).getByText("Correct", { exact: true }).first()).toBeVisible();
});
