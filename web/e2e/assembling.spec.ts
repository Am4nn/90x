import { expect, type Page, test } from "@playwright/test";
import { feedCard, openFeedCard, seededCard } from "./helpers";

const pool = (page: Page) => page.getByRole("list", { name: "Tokens" });

test("building the line from the pool is correct", async ({ page }) => {
  const card = seededCard((c) => c.archetype === "fill-code-blank", "fill-code-blank");
  await openFeedCard(page, "assembling-correct", card.promptMd);

  for (const token of card.options ?? []) {
    await pool(page).getByRole("button", { name: token, exact: true }).click();
  }
  await feedCard(page).getByRole("button", { name: "Check", exact: true }).click();

  await expect(feedCard(page).getByText("Correct", { exact: true })).toBeVisible();
});

test("a wrong token in the middle is wrong", async ({ page }) => {
  const card = seededCard((c) => c.archetype === "fill-code-blank", "fill-code-blank");
  await openFeedCard(page, "assembling-wrong", card.promptMd);

  // Swap `name` and `FROM` in the middle of the statement.
  const wrong = ["SELECT", "FROM", "name", "users", ";"];
  for (const token of wrong) {
    await pool(page).getByRole("button", { name: token, exact: true }).click();
  }
  await feedCard(page).getByRole("button", { name: "Check", exact: true }).click();

  await expect(feedCard(page).getByText("Not quite", { exact: true })).toBeVisible();
});

test("a templated card shows the pre-filled tokens and only asks for the gaps", async ({ page }) => {
  const card = seededCard((c) => c.archetype === "fill-clause", "fill-clause");
  await openFeedCard(page, "assembling-templated", card.promptMd);

  // Pre-filled tokens sit in the line, not the pool.
  await expect(feedCard(page).getByText("SELECT", { exact: true })).toBeVisible();
  await expect(feedCard(page).getByText("age", { exact: true })).toBeVisible();

  // Only the two gaps are offered as tokens.
  await expect(pool(page).getByRole("button")).toHaveCount(2);
  await expect(pool(page).getByRole("button", { name: "FROM", exact: true })).toBeVisible();
  await expect(pool(page).getByRole("button", { name: "WHERE", exact: true })).toBeVisible();

  await pool(page).getByRole("button", { name: "FROM", exact: true }).click();
  await pool(page).getByRole("button", { name: "WHERE", exact: true }).click();
  await feedCard(page).getByRole("button", { name: "Check", exact: true }).click();

  await expect(feedCard(page).getByText("Correct", { exact: true })).toBeVisible();
});
