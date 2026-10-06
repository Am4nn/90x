import { expect, test } from "@playwright/test";
import { checkInSolved, signIn } from "./helpers";

// The problem page is LeetCode-first: Open on LeetCode leads, a manual check-in
// still reaches the review with the row it just wrote, and each outcome points
// at the next step. LeetCode sync is off in CI (LEETCODE_SYNC_ENABLED is unset),
// so the sync button's own branches are exercised by hand, not here.
const SLUG = "two-sum";
const PATH = `/library/problem/${SLUG}`;

/** The check-in panel is the only form on the page; scope to it so the aside's
 *  Review / Learn links don't collide with the panel's own outcome links. */
const panel = (page: import("@playwright/test").Page) => page.locator('form:has(input[name="problemSlug"])');

test("Open on LeetCode leads the page, above the statement", { tag: "@mobile" }, async ({ page }) => {
  await signIn(page, "problem-page", { next: PATH });
  await expect(page.getByRole("heading", { level: 1, name: "Two Sum" })).toBeVisible();

  // It leads at every width: the header action on desktop, full-width under the
  // title on a phone, both above the reading column.
  const open = page.getByRole("link", { name: "Open on LeetCode" });
  await expect(open).toBeVisible();
  await expect(open).toHaveAttribute("href", "https://leetcode.com/problems/two-sum/");

  const statement = page.locator("section", { hasText: "This is an e2e fixture" });
  await expect(statement).toBeVisible();
  const openBox = await open.boundingBox();
  const statementBox = await statement.boundingBox();
  expect(openBox && statementBox && openBox.y < statementBox.y).toBe(true);
});

test("opened from Today, the back link goes to Today and does not name the pattern", async ({ page }) => {
  await signIn(page, "problem-page", { next: `${PATH}?from=today` });
  await expect(page.locator("a", { hasText: /←\s*Today/ })).toHaveAttribute("href", "/today");
  await expect(page.getByRole("link", { name: "Arrays & Hashing" })).toHaveCount(0);
});

test("the note is visible before any sync", async ({ page }) => {
  await signIn(page, "problem-page", { next: PATH });
  await expect(page.getByPlaceholder("Add a note…")).toBeVisible();
});

test("with LeetCode sync off there is no sync control and the manual check-in stays", async ({ page }) => {
  await signIn(page, "problem-page", { next: PATH });
  await expect(page.getByRole("button", { name: "Sync with LeetCode" })).toHaveCount(0);
  await expect(page.getByText("Pulls your submission")).toHaveCount(0);
  await expect(panel(page).getByRole("button", { name: "Check in", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open on LeetCode" })).toBeVisible();
});

test("a manual check-in still reaches the review with its check-in id", async ({ page }) => {
  await signIn(page, "problem-page", { next: PATH });
  await checkInSolved(page);

  await panel(page).getByRole("link", { name: "Review solution" }).click();
  await expect(page).toHaveURL(new RegExp(`/library/problem/${SLUG}/review\\?checkin=[0-9a-f-]{36}`));
});

test("a solved check-in offers the logged time, then Review solution", async ({ page }) => {
  await signIn(page, "problem-page", { next: PATH });
  await checkInSolved(page);

  await expect(page.getByText("Checked in. Logged 30m.")).toBeVisible();
  await expect(panel(page).getByRole("link", { name: "Review solution" })).toBeVisible();
});

test("a failed check-in offers Learn this pattern", async ({ page }) => {
  await signIn(page, "problem-page", { next: PATH });
  await page.getByRole("button", { name: "Missed", exact: true }).click();
  await page.getByRole("button", { name: "Check in", exact: true }).click();
  await expect(page.getByText("Checked in.")).toBeVisible();

  const learn = panel(page).getByRole("link", { name: "Learn this pattern" });
  await expect(learn).toBeVisible();
  await expect(learn).toHaveAttribute("href", "/coach?kind=lesson&ref=e2e-arrays");
  await expect(panel(page).getByRole("link", { name: "Review solution" })).toBeVisible();
});

test("statement, tricks, the reference solution and past check-ins all stay", async ({ page }) => {
  await signIn(page, "problem-page", { next: PATH });

  await expect(page.getByText("This is an e2e fixture")).toBeVisible();
  // The idea is a hint: closed on arrival, open on tap.
  await expect(page.getByText("One-pass hash map")).toBeHidden();
  await page.locator("summary", { hasText: "The idea" }).click();
  await expect(page.getByText("One-pass hash map")).toBeVisible();

  await page.getByText("Reference solution (Python)").click();
  await expect(page.getByText("class Solution:")).toBeVisible();

  // A note written on the form has to survive the server round trip and come
  // back on the past check-ins list; nothing but a landed write puts it there.
  await page.getByPlaceholder("Add a note…").fill("round-trip-note-xyz");
  await checkInSolved(page);
  await expect(page.getByText(/You solved in 30m/)).toBeVisible();
  await expect(page.getByText("round-trip-note-xyz")).toBeVisible();
});
