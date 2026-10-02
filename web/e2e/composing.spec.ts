import { expect, type Page, test } from "@playwright/test";
import { feedCard, openFeedCard, seededCard } from "./helpers";

// The written-answer screen (`compose`), used by behavioural cards only. It is
// the one place a model runs when an answer is checked: the answer is marked
// against the card's key points, one boolean each, by `gradeWithAi`.
//
// The fake model in e2e/fake-model.ts marks every point hit unless the answer
// contains "MISS", so a spec picks its outcome by what it types.

const card = () => seededCard((c) => c.primitive === "compose", "compose");
const box = (page: Page) => feedCard(page).getByRole("textbox");
const check = (page: Page) => feedCard(page).getByRole("button", { name: "Check", exact: true });

const GOOD =
  "Our product list took eight seconds to load. I added a cache in front of the catalogue query. Load time fell to under a second.";

test("a written answer that meets the rubric is correct", async ({ page }) => {
  const seeded = card();
  await openFeedCard(page, "composing-correct", seeded.promptMd);

  // The rubric is on screen before answering: a reader cannot be marked on
  // requirements they were never told.
  for (const point of seeded.keyPoints) {
    await expect(feedCard(page).getByText(point, { exact: true })).toBeVisible();
  }

  await box(page).fill(GOOD);
  await check(page).click();

  // A written answer does not get a Correct/Not quite label: it gets the rubric
  // back, point by point, which is the only feedback that tells the reader what
  // to fix. Every point hit is a full score.
  await expect(feedCard(page).getByText("4 of 4 key points")).toBeVisible();
  await expect(feedCard(page).getByText("100%", { exact: true })).toBeVisible();
  await expect(feedCard(page).getByRole("img", { name: "Covered" })).toHaveCount(4);
});

test("an answer that misses the rubric is wrong", async ({ page }) => {
  await openFeedCard(page, "composing-wrong", card().promptMd);

  await box(page).fill(`${GOOD} MISS`);
  await check(page).click();

  await expect(feedCard(page).getByText("0 of 4 key points")).toBeVisible();
  await expect(feedCard(page).getByRole("img", { name: "Missed" })).toHaveCount(4);
});

test("the card will not submit a fragment, and caps the answer", async ({ page }) => {
  await openFeedCard(page, "composing-bounds", card().promptMd);

  // Empty, then too short: an answer below the floor cannot have covered four
  // separate requirements, so the button stays off rather than spending a grade.
  await expect(check(page)).toBeDisabled();
  await box(page).fill("I fixed it.");
  await expect(check(page)).toBeDisabled();

  await box(page).fill(GOOD);
  await expect(check(page)).toBeEnabled();

  // The cap is a hard limit, not a hint: a per-key-point judgement over an essay
  // stops meaning anything, so the box refuses the extra characters outright.
  await box(page).fill("x".repeat(400));
  await expect(box(page)).toHaveValue("x".repeat(300));
});

test("the answer survives being typed, skipped past and returned to", async ({ page }) => {
  const seeded = card();
  await openFeedCard(page, "composing-skip", seeded.promptMd);

  await box(page).fill(GOOD);
  await feedCard(page).getByRole("button", { name: "Skip", exact: true }).click();

  // Skipping grades the card as skipped rather than submitting the text, so no
  // model call is made and the reader is not marked on an answer they abandoned.
  await expect(feedCard(page).getByText("key points", { exact: false })).toBeHidden();
  await expect(feedCard(page).getByRole("button", { name: "Next card", exact: true })).toBeVisible();
});

test("when the grade is unavailable the reader marks it themselves", async ({ page }) => {
  const seeded = card();
  await openFeedCard(page, "composing-selfmark", seeded.promptMd);

  // "UNGRADED" makes the fake model return a shape the app's schema rejects, which
  // is the path gradeWithAi falls back to self-mark on. The reader has already
  // written two or three sentences; an error and a Skip button would throw that away.
  await box(page).fill(`${GOOD} UNGRADED`);
  await check(page).click();

  await expect(feedCard(page).getByText("The automatic mark is unavailable.", { exact: false })).toBeVisible();
  // Marked against the rubric, because the model answer never reaches the client.
  for (const point of seeded.keyPoints) {
    await expect(feedCard(page).getByText(point, { exact: true })).toBeVisible();
  }

  await feedCard(page).getByRole("button", { name: "Got it", exact: true }).click();
  await expect(feedCard(page).getByRole("button", { name: "Next card", exact: true })).toBeVisible();
});
