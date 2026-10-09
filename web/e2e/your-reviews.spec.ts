import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";
import { PROBLEMS } from "./seed-data";

// Every saved solution review has a way back: its problem page and Me → Coach list it, and the row opens it.

test("a saved review is listed on its problem page and on Me → Coach, and opens again", async ({ page }) => {
  const problem = PROBLEMS[0]!;
  await signIn(page, "your-reviews", { next: `/library/problem/${problem.slug}/review` });
  await page.getByLabel("Your code", { exact: true }).fill("def two_sum(nums, target):\n    return [0, 1]");
  await page.getByRole("button", { name: "Review my solution", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/library/problem/${problem.slug}/review/[0-9a-f-]{36}$`));
  await page.goto(`/library/problem/${problem.slug}/review`);
  await page.getByLabel("Your code", { exact: true }).fill("def two_sum(nums, target):\n    return [1, 0]");
  await page.getByRole("button", { name: "Review my solution", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/library/problem/${problem.slug}/review/[0-9a-f-]{36}$`));
  const newest = page.url();

  await page.goto(`/library/problem/${problem.slug}`);
  const box = page.getByRole("region", { name: "Your reviews", exact: true });
  await expect(box.getByRole("link")).toHaveCount(2);
  await expect(box.getByRole("link").first()).toContainText("Correct");
  await expect(box.getByRole("link").first()).toHaveAttribute("href", new URL(newest).pathname);
  await box.getByRole("link").first().click();
  await expect(page.getByRole("heading", { name: "Solution review", exact: true })).toBeVisible();

  await page.goto("/me/coach");
  const all = page.getByRole("region", { name: "Solution reviews", exact: true });
  await expect(all.getByRole("link", { name: problem.title })).toHaveCount(2);
});
