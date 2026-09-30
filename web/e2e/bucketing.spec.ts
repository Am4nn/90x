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
