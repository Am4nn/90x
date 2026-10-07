import { expect, type Page, test } from "@playwright/test";
import { dropAnalyticsCache, seedReaders } from "./analytics-seed";
import { scan, setLaunchDate, signIn } from "./helpers";

const SECTIONS = [
  "Is anyone here?",
  "Are they coming back?",
  "What do they do?",
  "What do they study?",
  "Where do they come from?",
  "Cost and health",
  "People",
];
const CHARTS = [
  "People active each day",
  "Did each sign-up week come back?",
  "Actions per day, by kind",
  "Where people drop off",
  "Answers and accuracy by area",
  "Sign-ups by source",
  "Share card and invite links",
  "AI spend per day",
  "Lifetime AI spend",
  "Problem reports",
];

async function expectSections(page: Page) {
  for (const name of SECTIONS) await expect(page.getByRole("region", { name, exact: true })).toBeVisible();
  for (const name of CHARTS) await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  // Every chart and the People list carry a caption written from the numbers (the jobs section has its own).
  let captions = 0;
  for (const name of SECTIONS) captions += await page.getByRole("region", { name, exact: true }).getByText("In plain words:").count();
  expect(captions).toBe(CHARTS.length + 1);
  await expect(page.getByRole("region", { name: "Scheduled jobs", exact: true })).toBeVisible();
}

test("an admin sees the seven Analytics sections and can change the range", async ({ page }) => {
  await signIn(page, "admin-analytics", { admin: true, next: "/admin/analytics" });
  await expect(page.getByRole("heading", { name: "Analytics", exact: true })).toBeVisible();
  await expectSections(page);
  await expect(page.getByText("New sign-ups, last 30 days")).toBeVisible();
  await expect(page.getByText("Active today, so far")).toBeVisible();
  // Admins and test accounts are left out, and the page says so.
  await expect(page.getByText(/Numbers leave out admins and test accounts/)).toBeVisible();
  // The jump links reach the sections.
  await page.getByRole("navigation", { name: "Jump to" }).getByRole("link", { name: "People" }).click();
  await expect(page).toHaveURL(/#people$/);

  const range = page.getByRole("navigation", { name: "Range" });
  await expect(range.getByRole("link", { name: "30 days" })).toHaveAttribute("aria-current", "page");
  await range.getByRole("link", { name: "7 days" }).click();
  await expect(page).toHaveURL(/range=7/);
  await expect(page.getByText("New sign-ups, last 7 days")).toBeVisible();
  await expect(range.getByRole("link", { name: "7 days" })).toHaveAttribute("aria-current", "page");
  await expectSections(page);
  await range.getByRole("link", { name: "90 days" }).click();
  await expect(page).toHaveURL(/range=90/);
  await expect(page.getByText("New sign-ups, last 90 days")).toBeVisible();
  await expect(page.getByRole("link", { name: "Analytics" }).first()).toHaveAttribute("aria-current", "page");
});

for (const [label, viewport] of [
  ["1280px", { width: 1280, height: 800 }],
  ["390px", { width: 390, height: 844 }],
] as const) {
  test(`Analytics with readers in it is accessible and fits at ${label}`, async ({ page }) => {
    const seed = await seedReaders();
    try {
      await dropAnalyticsCache();
      await page.setViewportSize(viewport);
      await signIn(page, `admin-analytics-a11y-${label}`, { admin: true, next: "/admin/analytics" });
      await expect(page.getByRole("heading", { name: "Analytics", exact: true })).toBeVisible();
      await expectSections(page);
      // The populated forms, not the empty states: one per section.
      await expect(page.getByRole("img", { name: /^People active each day: / })).toBeVisible();
      await expect(page.getByRole("table", { name: /each sign-up week/ })).toBeVisible();
      await expect(page.getByRole("img", { name: /^Cards answered per day: / })).toBeVisible();
      await expect(
        page
          .getByRole("region", { name: "What do they study?", exact: true })
          .getByText(/% right$/)
          .first(),
      ).toBeAttached();
      await expect(page.getByText(/^\S•+@example\.test$/).first()).toBeVisible(); // a masked sharer or reader
      await expect(page.getByText(/The grading spinner never stops on a long answer/)).toBeVisible();
      await expect(page.getByRole("img", { name: /^AI spend per day: / })).toBeVisible();
      await expect(page.getByRole("table", { name: /most recently active/ })).toBeVisible();
      await scan(page, `Analytics with readers at ${label}`);
      // One column on a phone, and nothing scrolls sideways at either width.
      const widths = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, window: window.innerWidth }));
      expect(widths.page).toBeLessThanOrEqual(widths.window);
    } finally {
      await seed.clear();
      await dropAnalyticsCache();
    }
  });
}

test("a non-admin gets the 404 page for /admin/analytics", async ({ page }) => {
  await signIn(page, "member-analytics");
  await page.goto("/admin/analytics");
  await expect(page.getByRole("heading", { name: "No such page." })).toBeVisible();
  await expect(page.getByText("Sign-ups by source")).toHaveCount(0);
});

test("the Launch gate panel is hidden until a launch date is set, then shows and hides again", async ({ page }) => {
  await signIn(page, "admin-launch-gate", { admin: true, next: "/admin/analytics" });
  await expect(page.getByRole("heading", { name: "Analytics", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Launch gate", exact: true })).toHaveCount(0);

  try {
    await setLaunchDate(page, new Date().toISOString().slice(0, 10));
    await page.goto("/admin/analytics");
    const gate = page.getByRole("region", { name: "Launch gate" });
    await expect(page.getByRole("heading", { name: "Launch gate", exact: true })).toBeVisible();
    // Node's UTC date can be a day behind the server's around midnight, so day 0 or 1; both are on track at pace 0.
    await expect(gate.getByText(/^Day [01] of 30$/)).toBeVisible();
    await expect(gate.getByText("on track", { exact: true })).toBeVisible();
    await expect(gate.getByText(/^\d+ of 20$/).first()).toBeVisible();
    await expect(gate.getByText(/^pace for day [01]: 0 of 20$/)).toBeVisible();
    await expect(gate.getByText("Returners can't appear before day 7.")).toBeVisible();
    await expect(gate.getByText(/%/)).toHaveCount(0);
    await expect(gate.getByRole("progressbar", { name: "Week-2 returners" })).toBeVisible();
    // The launch post is marked on the daily line once it is in range.
    await expect(page.getByText("Launch post", { exact: true })).toBeAttached();
  } finally {
    // The e2e database is shared: clear the date so other specs and a later run start hidden.
    await setLaunchDate(page, "");
  }
  await page.goto("/admin/analytics");
  await expect(page.getByRole("heading", { name: "Launch gate", exact: true })).toHaveCount(0);
});
