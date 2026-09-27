import { expect, type Page, test } from "@playwright/test";
import { signIn } from "./helpers";
import { correctAnswer, LIVE_CARDS } from "./seed-data";

/** The seeded card the Feed is showing, found by its prompt. */
async function shownCard(page: Page) {
  await expect(page.getByRole("button", { name: "Check", exact: true })).toBeVisible();
  for (const card of LIVE_CARDS) {
    if (await page.getByText(card.promptMd, { exact: true }).isVisible()) return card;
  }
  throw new Error("The Feed is showing a card that isn't in the e2e seed");
}

// Written against the Feed screen ,
// which hasn't merged yet. Enable it once it has; the Feed queue also needs a
// Redis (UPSTASH_REDIS_REST_URL/TOKEN) in the e2e job by then.
test.fixme("answering a card with every key point grades it without AI, then Next shows another", { tag: "@mobile" }, async ({ page }) => {
  await signIn(page, "feed", { next: "/feed" });
  const skipDiagnostic = page.getByRole("button", { name: "Skip for now" });
  const check = page.getByRole("button", { name: "Check", exact: true });
  await expect(skipDiagnostic.or(check)).toBeVisible();
  if (await skipDiagnostic.isVisible()) await skipDiagnostic.click();

  const card = await shownCard(page);
  await page.getByRole("textbox").fill(correctAnswer(card));
  await check.click();
  // An exact match (every key point present) is graded without AI.
  const n = card.keyPoints.length;
  await expect(page.getByText(card.format === "typed" ? `${n} of ${n} key points` : "Correct", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText(card.promptMd, { exact: true })).toHaveCount(0);
  expect((await shownCard(page)).id).not.toBe(card.id);
});
