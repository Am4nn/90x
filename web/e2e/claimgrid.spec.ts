import { expect, type Page, test } from "@playwright/test";
import { feedCard, openFeedCard, seededCard } from "./helpers";

const rows = (page: Page) => page.getByRole("list", { name: "Statements" }).getByRole("listitem");

test("marking every row correctly is correct", async ({ page }) => {
  const card = seededCard((c) => c.primitive === "claim_grid", "claim_grid");
  await openFeedCard(page, "claimgrid-correct", card.promptMd);

  await rows(page).nth(0).getByRole("button", { name: "True", exact: true }).click();
  await rows(page).nth(1).getByRole("button", { name: "True", exact: true }).click();
  await rows(page).nth(2).getByRole("button", { name: "False", exact: true }).click();
  await feedCard(page).getByRole("button", { name: "Check answer", exact: true }).click();

  await expect(feedCard(page).getByText("Correct", { exact: true }).first()).toBeVisible();
});

test("one wrong row is wrong", async ({ page }) => {
  const card = seededCard((c) => c.primitive === "claim_grid", "claim_grid");
  await openFeedCard(page, "claimgrid-wrong", card.promptMd);

  await rows(page).nth(0).getByRole("button", { name: "True", exact: true }).click();
  await rows(page).nth(1).getByRole("button", { name: "True", exact: true }).click();
  await rows(page).nth(2).getByRole("button", { name: "True", exact: true }).click(); // wrong
  await feedCard(page).getByRole("button", { name: "Check answer", exact: true }).click();

  await expect(feedCard(page).getByText("Not quite", { exact: true })).toBeVisible();
});

test("the grid refuses to submit with a row unanswered", async ({ page }) => {
  const card = seededCard((c) => c.primitive === "claim_grid", "claim_grid");
  await openFeedCard(page, "claimgrid-forced", card.promptMd);

  const check = feedCard(page).getByRole("button", { name: "Check answer", exact: true });
  await expect(check).toBeDisabled();
  await expect(feedCard(page).getByText("0 of 3 marked.")).toBeVisible();

  // Answer two of three rows: still locked until the last row is judged.
  await rows(page).nth(0).getByRole("button", { name: "True", exact: true }).click();
  await rows(page).nth(1).getByRole("button", { name: "True", exact: true }).click();
  await expect(check).toBeDisabled();
  await expect(feedCard(page).getByText("2 of 3 marked.")).toBeVisible();

  await rows(page).nth(2).getByRole("button", { name: "False", exact: true }).click();
  await expect(check).toBeEnabled();
});
