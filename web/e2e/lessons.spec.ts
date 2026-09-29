import { expect, type Page, test } from "@playwright/test";
import { signIn } from "./helpers";

const modes = (page: Page) => page.getByRole("navigation", { name: "Coach modes" });
const index = (page: Page) => page.getByRole("list", { name: "All patterns" });

test("the modes nav has four entries and Lessons is its own page, not the Library", async ({ page }) => {
  await signIn(page, "lessons-modes", { next: "/coach" });
  await expect(modes(page).getByRole("link")).toHaveCount(4);

  const lessons = modes(page).getByRole("link", { name: /Lessons/ });
  await expect(lessons).toHaveAttribute("href", "/coach/lessons");
  await expect(lessons).not.toHaveAttribute("href", "/library");
  await expect(modes(page).getByRole("link", { name: /Story bank/ })).toHaveAttribute("href", "/me/stories");
});

test("Story bank in the modes nav still reaches /me/stories", async ({ page }) => {
  await signIn(page, "lessons-story", { next: "/coach" });
  await modes(page)
    .getByRole("link", { name: /Story bank/ })
    .click();
  await expect(page).toHaveURL(/\/me\/stories$/);
  await expect(page.getByRole("heading", { name: "Story bank" })).toBeVisible();
});

test("Lessons lists every pattern and a Teach me opens the existing coach lesson flow", async ({ page }) => {
  await signIn(page, "lessons-index", { next: "/coach/lessons" });
  await expect(page.getByRole("heading", { name: "All patterns" })).toBeVisible();

  // The pattern index follows the map's order, which is the seeded sort order.
  const names = await index(page).getByRole("listitem").allInnerTexts();
  const at = (name: string) => names.findIndex((text) => text.includes(name));
  expect(at("Arrays & Hashing")).toBeGreaterThanOrEqual(0);
  expect(at("Arrays & Hashing")).toBeLessThan(at("Two Pointers"));
  expect(at("Two Pointers")).toBeLessThan(at("Stack"));

  // The action is the lesson flow that already exists: the slug, and nothing else.
  const teach = index(page).getByRole("link", { name: "Teach me Arrays & Hashing" });
  await expect(teach).toHaveAttribute("href", "/coach?kind=lesson&ref=e2e-arrays");
  await teach.click();
  await expect(page).toHaveURL(/\/coach\?kind=lesson&ref=e2e-arrays$/);
});

test("with no check-ins the pattern index leads and the weakest slot is an empty state", async ({ page }) => {
  // signIn makes a fresh account, and a fresh account has no check-ins, so
  // weakestPatterns returns nothing. That is the common case, not an edge case.
  await signIn(page, "lessons-empty", { next: "/coach/lessons" });
  await expect(page.getByRole("list", { name: "Your weakest patterns" })).toHaveCount(0);

  const rows = index(page).getByRole("listitem");
  await expect(rows.first()).toContainText("Arrays & Hashing");
  await expect(index(page).getByRole("link", { name: "Teach me Stack" })).toBeVisible();

  const empty = page.getByText("Nothing to flag yet");
  await expect(empty).toBeVisible();

  // The index is what the page leads with: it sits above the empty state, which
  // takes the weakest section's place rather than leaving a blank area.
  const indexTop = (await index(page).boundingBox())?.y ?? 0;
  const emptyTop = (await empty.boundingBox())?.y ?? 0;
  expect(indexTop).toBeLessThan(emptyTop);
});
