import { expect, test } from "@playwright/test";
import { scan, setLaunchDate, signIn } from "./helpers";

// Accessibility, checked against what the browser actually rendered: see scan() in helpers.ts.

test("Today is accessible", { tag: "@mobile" }, async ({ page }) => {
  await signIn(page, "a11y-today");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await scan(page, "Today");
});

test("Me is accessible", async ({ page }) => {
  // Added because the invite field on /me shipped with no accessible name and
  // this scan covered every other screen, so nothing said so.
  await signIn(page, "a11y-me", { next: "/me" });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await scan(page, "Me");
});

test("the Feed is accessible", async ({ page }) => {
  await signIn(page, "a11y-feed", { cards: true, next: "/feed" });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await scan(page, "Feed");
});

test("the Library and a topic page are accessible", async ({ page }) => {
  await signIn(page, "a11y-library", { next: "/library" });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await scan(page, "Library");

  // A topic page too, which this test claimed to cover and did not: it is a long
  // authored lesson with headings, code and a practice list, so it is the page
  // most likely to have a heading-order or contrast problem in the first place.
  // DSA's map selects patterns rather than linking out, so take the Design tab's lesson.
  await page.goto("/library?area=system_design");
  await page.getByRole("link", { name: "Caching", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // The Library's title is still up for a moment; wait for the topic's own before scanning.
  await expect(page).toHaveTitle(/caching/i);
  await scan(page, "A topic page");
});

test("Coach is accessible", async ({ page }) => {
  await signIn(page, "a11y-coach", { next: "/coach?new=1" });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await scan(page, "Coach");
});

for (const [label, viewport] of [
  ["1280px", { width: 1280, height: 800 }],
  ["390px", { width: 390, height: 844 }],
] as const) {
  test(`the landing page is accessible before anyone signs in, ${label}`, async ({ page }) => {
    // Reduced motion shows every animated part in its finished state, so axe scans the page as it
    // reads and not a frame of the scramble or a block still sliding in.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await scan(page, `Landing at ${label}`);
  });
}

test("/try is accessible: unanswered, answered right, and answered wrong", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/try");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await scan(page, "Try, unanswered");
  await page.getByRole("button", { name: /Update the database, then delete the cache key/ }).click(); // the right answer for System design
  await expect(page.locator('[data-try="bar"]')).toBeVisible();
  await scan(page, "Try, answered right, with the bar");
  await page.getByRole("tab", { name: "DSA" }).click();
  await page.getByRole("button", { name: /O\(n²\), because the while loop/ }).click(); // wrong for DSA
  await expect(page.locator("#try-verdict")).toContainText("Not quite");
  await scan(page, "Try, answered wrong, with the code block");
});

test("/try is accessible at 360px", { tag: "@mobile" }, async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/try");
  await page.getByRole("tab", { name: "SQL" }).click();
  await page.getByRole("button", { name: /WHERE o\.year = 2026/ }).click();
  await scan(page, "Try at 360px, SQL answered");
});

test("Analytics with the Launch gate showing is accessible", async ({ page }) => {
  await signIn(page, "a11y-launch-gate", { admin: true, next: "/admin/settings" });
  try {
    await setLaunchDate(page, new Date().toISOString().slice(0, 10));
    await page.goto("/admin/analytics");
    await expect(page.getByRole("heading", { name: "Launch gate", exact: true })).toBeVisible();
    await scan(page, "Analytics with the Launch gate");
  } finally {
    await setLaunchDate(page, "");
  }
});
