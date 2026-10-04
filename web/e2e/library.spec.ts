import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

const tabs = (page: import("@playwright/test").Page) => page.getByRole("tablist", { name: "Library tracks" });

test("the tab strip is the URL: each area is a link, the active one shows its count, and there is no roadmap toggle", async ({ page }) => {
  await signIn(page, "library-tabs", { next: "/library" });
  await expect(tabs(page).getByRole("tab", { name: /^DSA/ })).toHaveAttribute("aria-selected", "true");

  await tabs(page).getByRole("tab", { name: "Design" }).click();
  await expect(page).toHaveURL(/\/library\?area=system_design$/);
  const design = tabs(page).getByRole("tab", { name: /^Design/ });
  await expect(design).toHaveAttribute("aria-selected", "true");
  // The count follows the label and only the active tab has one.
  await expect(design).toHaveText(/^Design\d+$/);
  await expect(tabs(page).getByRole("tab", { name: "DSA" })).toHaveText("DSA");

  // The old `?area=` links keep working, and the roadmap view is gone.
  await page.goto("/library?area=system_design&view=roadmap");
  await expect(page.getByRole("radio", { name: "Roadmap" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /roadmap/i })).toHaveCount(0);
});

test("search opens from the button and from the keyboard, and keeps the area", async ({ page }) => {
  await signIn(page, "library-search", { next: "/library?area=system_design" });
  const field = page.getByRole("textbox", { name: "Search topics" });
  // The button only works once the page has hydrated, so retry the click until the field opens.
  await expect(async () => {
    if (!(await field.isVisible())) await page.getByRole("button", { name: "Search topics" }).click();
    await expect(field).toBeVisible({ timeout: 1000 });
  }).toPass();
  await expect(field).toBeFocused();
  await field.fill("cache");
  await field.press("Enter");
  await expect(page).toHaveURL(/area=system_design&q=cache/);
  await expect(page.getByRole("heading", { name: /Results for/ })).toBeVisible();
  await expect(tabs(page).getByRole("tab", { name: /^Design/ })).toHaveAttribute("aria-selected", "true");

  // Ctrl+K (⌘K on a Mac) opens it from anywhere on the page. The search reloaded the page, so
  // the shortcut too waits for hydration.
  await expect(async () => {
    if (!(await field.isVisible())) await page.keyboard.press("Control+k");
    await expect(field).toBeFocused({ timeout: 1000 });
  }).toPass();
  // Esc closes it and hands focus back to the button.
  await page.keyboard.press("Escape");
  await expect(field).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Search topics" })).toBeFocused();
});

test("the strip scrolls with arrows on a phone and opens on the active tab", { tag: "@mobile" }, async ({ page, isMobile }) => {
  test.skip(!isMobile, "The strip only overflows on a phone");
  await signIn(page, "library-arrows", { next: "/library?area=competitive" });
  await expect(tabs(page).getByRole("tab", { name: /^Competitive/ })).toBeInViewport();
  const left = page.getByRole("button", { name: "Previous tracks" });
  await expect(left).toBeVisible();
  await expect(page.getByRole("button", { name: "More tracks" })).toHaveCount(0);

  // Each tap moves the strip a step; at the start the left arrow goes away.
  await expect(async () => {
    if (await left.isVisible()) await left.click();
    await expect(left).toHaveCount(0, { timeout: 1000 });
  }).toPass();
  await expect(tabs(page).getByRole("tab", { name: "DSA" })).toBeInViewport();
  await expect(page.getByRole("button", { name: "More tracks" })).toBeVisible();
});

const group = (page: import("@playwright/test").Page, name: string) => page.getByRole("region", { name });

test("the topic list groups an area by its sections and counts what you have studied", async ({ page }) => {
  await signIn(page, "library-topics", { next: "/library?area=sql" });
  await expect(tabs(page).getByRole("tab", { name: /^SQL/ })).toHaveText("SQL14");
  await expect(page.getByRole("heading", { level: 2 })).toHaveText(["Foundations", "Querying", "Performance"]);
  await expect(group(page, "Foundations")).toContainText("0 of 4 done");
  // A sub-card is a chip under its topic, not a row of its own.
  await expect(group(page, "Querying").getByRole("link", { name: "INNER vs OUTER JOIN" })).toBeVisible();

  await group(page, "Foundations").getByRole("link", { name: "NULL handling" }).click();
  await page.getByRole("button", { name: "Mark studied" }).click();
  await expect(page.getByRole("button", { name: /Studied/ })).toBeVisible();

  await page.goto("/library?area=sql");
  await expect(group(page, "Foundations")).toContainText("1 of 4 done");
  await expect(group(page, "Foundations")).toContainText("Done");
});

test("a minute on a lesson shows it as opened, and the topic as started", async ({ page }) => {
  await signIn(page, "library-opened", { next: "/library?area=sql" });
  await page.clock.install();
  await page.goto("/library/topic/e2e-sql-inner-vs-outer-join");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // The timer starts once the page has hydrated; jumping the clock before that would skip it.
  await page.waitForLoadState("networkidle");
  // Under a minute is a glance, and records nothing.
  await page.clock.fastForward(30_000);
  const saved = page.waitForResponse((r) => r.request().method() === "POST" && Boolean(r.request().headers()["next-action"]));
  await page.clock.fastForward(31_000);
  await saved;

  await page.goto("/library?area=sql");
  const querying = group(page, "Querying");
  await expect(querying.getByRole("link", { name: /^INNER vs OUTER JOIN.*opened$/ })).toBeVisible();
  await expect(querying).toContainText("0 of 3 done");
});

test("on a phone a topic shows three sub-cards, then +N more", { tag: "@mobile" }, async ({ page, isMobile }) => {
  test.skip(!isMobile, "A wide screen shows every sub-card");
  await signIn(page, "library-more", { next: "/library?area=ai" });
  const topics = group(page, "Topics");
  await expect(topics.getByRole("link", { name: "Bias-Variance Tradeoff" })).toBeVisible();
  await expect(topics.getByRole("link", { name: "Regularization" })).toBeHidden();
  // Machine Learning Fundamentals, the first topic, has eight.
  await topics.getByRole("button", { name: "+5 more" }).first().click();
  await expect(topics.getByRole("link", { name: "Regularization" })).toBeVisible();
  await topics.getByRole("button", { name: "Show less" }).first().click();
  await expect(topics.getByRole("link", { name: "Regularization" })).toBeHidden();
});

test("a pattern's problem list holds only that pattern's problems", async ({ page }) => {
  // Seen live: Advanced Graphs listed Two Sum and Valid Parentheses.
  await signIn(page, "library-pattern-list", { next: "/library?area=dsa&pattern=e2e-two-pointers" });
  await expect(page.getByText("Valid Palindrome", { exact: true })).toBeVisible();
  await expect(page.getByText("Two Sum", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Contains Duplicate", { exact: true })).toHaveCount(0);
});
