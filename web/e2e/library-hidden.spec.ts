import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { checkInSolved, signIn } from "./helpers";

// A problem the catalog dropped while someone's history held it: the catalog keeps the row
// with `hidden` set (migration 039). The Library never offers it again, in a pattern's list or in
// search, but its page still opens and still takes a check-in, because history links to it.
// The row is written over the database connection and removed afterwards.

const url = process.env.DATABASE_URL ?? "";
const local = /@(127\.0\.0\.1|localhost)[:/]/.test(url);
test.skip(!local, "writes a problems row, so it runs only against the local database");

const SLUG = "e2e-hidden-twin-sum";
const TITLE = "Dropped Twin Sum";
const db = local ? postgres(url, { max: 1, prepare: false }) : null;

async function removeFixture() {
  if (!db) return;
  await db`delete from public.checkins where problem_slug = ${SLUG}`;
  await db`delete from public.problems where slug = ${SLUG}`;
}

test.beforeAll(async () => {
  if (!db) return;
  await removeFixture();
  // Important enough to top its pattern's list, were it listed.
  await db`insert into public.problems (slug, kind, lc_number, title, difficulty, pattern_slug, importance, statement_md, url, hidden)
           values (${SLUG}, 'leetcode', 99999, ${TITLE}, 'Easy', 'e2e-two-pointers', 0.99,
                   'A problem the catalog dropped.', 'https://leetcode.com/problems/two-sum/', true)`;
});

test.afterAll(async () => {
  await removeFixture();
  await db?.end();
});

test("a hidden problem is not listed or found, but its page opens and takes a check-in", async ({ page }) => {
  await signIn(page, "hidden-problem", { next: "/library?area=dsa&pattern=e2e-two-pointers" });
  // The pattern's own list still shows, without the dropped problem.
  await expect(page.getByText("Valid Palindrome", { exact: true })).toBeVisible();
  await expect(page.getByText(TITLE, { exact: true })).toHaveCount(0);

  await page.goto(`/library?area=dsa&q=${encodeURIComponent("Twin Sum")}`);
  await expect(page.getByRole("heading", { name: /Results for/ })).toBeVisible();
  await expect(page.getByText("Nothing matches that.")).toBeVisible();
  await expect(page.getByText(TITLE, { exact: true })).toHaveCount(0);

  // Reached from history (a check-in, a review, Today), the page is all there.
  await page.goto(`/library/problem/${SLUG}`);
  await expect(page.getByRole("heading", { level: 1, name: TITLE })).toBeVisible();
  await checkInSolved(page);

  // A check-in does not bring it back into the Library.
  await page.goto("/library?area=dsa&pattern=e2e-two-pointers");
  await expect(page.getByText("Valid Palindrome", { exact: true })).toBeVisible();
  await expect(page.getByText(TITLE, { exact: true })).toHaveCount(0);
});
