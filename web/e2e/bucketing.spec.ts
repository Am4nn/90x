import { expect, type Page, test } from "@playwright/test";
import { feedCard, openFeedCard, seededCard } from "./helpers";

const items = (page: Page) => page.getByRole("list", { name: "Items" });
const columns = (page: Page) => page.getByRole("list", { name: "Columns" });

async function place(page: Page, item: string, column: string) {
  await items(page).getByRole("button", { name: item, exact: true }).click();
  await columns(page).getByRole("button", { name: column, exact: true }).click();
}

test("every item lands in a column and one tick per row is enforced in the UI", async ({ page }) => {
  const card = seededCard((c) => c.primitive === "bucket", "bucket");
  await openFeedCard(page, "bucketing-correct", card.promptMd);

  await place(page, "upper()", "Deterministic");
  await place(page, "now()", "Not deterministic");
  await place(page, "random()", "Not deterministic");

  // Re-arm upper() and move it to the other column: it keeps exactly one tick.
  await items(page)
    .getByRole("button", { name: /upper\(\)/ })
    .click();
  await columns(page).getByRole("button", { name: "Not deterministic", exact: true }).click();
  await expect(items(page).getByRole("button", { name: "upper() — in Not deterministic", exact: true })).toBeVisible();
  await expect(items(page).getByRole("button", { name: "upper() — in Deterministic", exact: true })).toHaveCount(0);

  // Put it back where it belongs and submit.
  await items(page)
    .getByRole("button", { name: /upper\(\)/ })
    .click();
  await columns(page).getByRole("button", { name: "Deterministic", exact: true }).click();
  await feedCard(page).getByRole("button", { name: "Check", exact: true }).click();

  await expect(feedCard(page).getByText("Correct", { exact: true })).toBeVisible();
});

test("one item in the wrong column is wrong", async ({ page }) => {
  const card = seededCard((c) => c.primitive === "bucket", "bucket");
  await openFeedCard(page, "bucketing-wrong", card.promptMd);

  await place(page, "upper()", "Not deterministic"); // wrong
  await place(page, "now()", "Not deterministic");
  await place(page, "random()", "Not deterministic");
  await feedCard(page).getByRole("button", { name: "Check", exact: true }).click();

  await expect(feedCard(page).getByText("Not quite", { exact: true })).toBeVisible();
});

test("a wrong placement is shown in the buckets, not just described", async ({ page }) => {
  // Before this, every primitive but pick-one dropped its layout the moment it
  // was answered and explained itself in a paragraph, so the reader had to
  // rebuild the question from memory to see what they got wrong.
  const card = seededCard((c) => c.primitive === "bucket", "bucket");
  await openFeedCard(page, "bucketing-review", card.promptMd);

  await place(page, "upper()", "Not deterministic");
  await place(page, "now()", "Not deterministic");
  await place(page, "random()", "Not deterministic");
  await feedCard(page).getByRole("button", { name: "Check", exact: true }).click();

  const review = feedCard(page).getByRole("group", { name: "Your buckets" });
  await expect(review).toBeVisible();
  // The misplaced item is named, in the column the reader put it in, with where
  // it belonged.
  await expect(review.getByText(/upper\(\)/)).toBeVisible();
  await expect(review.getByText(/Deterministic/).first()).toBeVisible();
});
