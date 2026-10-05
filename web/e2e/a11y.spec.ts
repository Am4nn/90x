import { AxeBuilder } from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { signIn } from "./helpers";

// Accessibility, checked against what the browser actually rendered.
//
// eslint-config-next brings jsx-a11y rules, but they read the source: they can
// see a missing alt on a literal <img> and nothing about contrast, focus order,
// a heading level that only makes sense once the data arrives, or an aria-label
// that a template built wrong. axe runs in the page and asks the rendered DOM.
//
// Only serious and critical violations fail. The lighter two, "minor" and
// "moderate", are largely stylistic and a gate that fires on taste gets
// disabled; these are the ones a person using a screen reader or a keyboard
// actually hits.
const BLOCKING = new Set(["serious", "critical"]);

async function scan(page: Page, where: string) {
  const { violations } = await new AxeBuilder({ page })
    // The splash covers the page on a cold load and is aria-hidden on purpose.
    .exclude(".splash")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  const blocking = violations.filter((v) => BLOCKING.has(v.impact ?? ""));
  const detail = blocking
    .map((v) => `\n  [${v.impact}] ${v.id}: ${v.help}\n      ${v.nodes.map((n) => n.target.join(" ")).join("\n      ")}`)
    .join("");
  expect(blocking, `${where} has accessibility violations:${detail}`).toEqual([]);
}

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
  await scan(page, "A topic page");
});

test("Coach is accessible", async ({ page }) => {
  await signIn(page, "a11y-coach", { next: "/coach?new=1" });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await scan(page, "Coach");
});

test("the landing page is accessible before anyone signs in", async ({ page }) => {
  // Reduced motion shows every animated part in its finished state, so axe scans the
  // page as it reads and not a frame of the scramble or a block still sliding in.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await scan(page, "Landing");
});
