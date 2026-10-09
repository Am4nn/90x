import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

// Add with Coach: say what you want under Extras, Coach proposes (the fake model answers
// FAKE_ADD: Top K Frequent Elements and Trapping Rain Water), only what is left ticked lands in Extras, and the
// day's count does not move.

const dayCount = (page: Parameters<typeof signIn>[0]) => page.getByText(/^\d+ of \d+ done$/);

test("Add with Coach proposes, I untick one, and only the other lands in Extras", async ({ page }) => {
  await signIn(page, "add-coach", { next: "/today" });
  const before = await dayCount(page).innerText();

  await page.getByRole("button", { name: "Add with Coach" }).click();
  await expect(page.getByRole("textbox", { name: "What Coach should add" })).toHaveAttribute(
    "placeholder",
    "e.g. a medium graph problem Google asks",
  );
  await page.getByRole("textbox", { name: "What Coach should add" }).fill("two easy hashing problems");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Two you haven't tried.")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Refine" })).toHaveAttribute("placeholder", "Not quite? Tell Coach what to change");
  await expect(page.getByRole("button", { name: "Harder", exact: true })).toBeVisible();

  await page.getByRole("checkbox", { name: /Trapping Rain Water/ }).uncheck();
  await page.getByRole("button", { name: "Add 1 to Extras" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Added 1 to Extras." })).toBeVisible();

  const extras = page.getByRole("list", { name: "Extras" });
  await expect(extras.getByRole("link", { name: "Top K Frequent Elements", exact: true })).toBeVisible();
  await expect(extras.getByText(/Added with Coach · today/)).toBeVisible();
  await expect(extras.getByRole("link", { name: "Trapping Rain Water", exact: true })).toHaveCount(0);
  await expect(dayCount(page)).toHaveText(before);

  // × only folds the box: reopening shows the day's thread.
  await page.getByRole("button", { name: "Add with Coach" }).click();
  await expect(page.getByText("two easy hashing problems")).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("button", { name: "Add with Coach" })).toBeVisible();
});

test("Add with Coach: nothing ticked cannot be added", async ({ page }) => {
  await signIn(page, "add-coach-none", { next: "/today" });
  await page.getByRole("button", { name: "Add with Coach" }).click();
  await page.getByRole("textbox", { name: "What Coach should add" }).fill("two easy hashing problems");
  await page.getByRole("button", { name: "Send" }).click();
  await page.getByRole("checkbox", { name: /Trapping Rain Water/ }).uncheck();
  await page.getByRole("checkbox", { name: /Top K Frequent Elements/ }).uncheck();
  await expect(page.getByRole("button", { name: "Pick at least one" })).toBeDisabled();
});
