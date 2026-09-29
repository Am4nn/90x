import { expect, test, type Page } from "@playwright/test";
import { missions, signIn } from "./helpers";

// The Coach's weekly read on Today. The review itself is written by the Sunday
// job from a model call, so nothing in the UI creates one: the three fixed users
// and their reviews come from scripts/seed-e2e.ts (WEEKLY_USERS in seed-data.ts),
// and these sign-ins use fixed addresses so the seed and the spec agree on them.
//
// The device dismissal is localStorage keyed by weekStart, so the two cases worth
// the most here are (a) a dismissal surviving a reload and (b) a newer review
// showing anyway, which is what keying on the week buys and what would break
// silently if the key changed.

const WEEK_OLD = "2026-09-14";
const REVIEW_ONLY = "e2e00000-0000-4000-8000-000000000101";
const REVIEW_NEWER = "e2e00000-0000-4000-8000-000000000103";
const REVIEW_DECIDED = "e2e00000-0000-4000-8000-000000000104";
const DISMISSED_KEY = "90x:weekly-dismissed";

const card = (page: Page) => page.locator('section[aria-label="Coach\'s read"]');

async function signInAs(page: Page, email: string, next = "/today") {
  await page.goto(`/api/test/sign-in?${new URLSearchParams({ email, next })}`);
  await expect(page).toHaveURL(next);
}

test("the Coach's read card sits above the missions with the score, the read and the count", async ({ page }) => {
  await signInAs(page, "weekly-read@e2e.test");
  const read = card(page);
  await expect(read).toBeVisible();
  await expect(read.getByRole("heading", { name: "Coach's read" })).toBeVisible();
  // The week label lives under the title on a phone but moves into the header on
  // desktop, so the desktop card has one visible copy of it.
  await expect(read.locator("span:visible", { hasText: "Week of Sep 14" })).toBeVisible();
  // The coach's own score, the formula beside it, and the gap between them.
  await expect(read.getByText("68")).toBeVisible();
  await expect(read.getByText("Your dial")).toBeVisible();
  await expect(read.getByText("61")).toBeVisible();
  await expect(read.getByText("+7 this week")).toBeVisible();
  await expect(read.getByText("You held the streak but leaned on hints for graphs.")).toBeVisible();
  // The card no longer lists the changes themselves; the review page does. It
  // names them as a count and offers one way through to the full review. On
  // desktop the footer is just the count beside a small button.
  await expect(read.getByText("2 suggested changes", { exact: true })).toBeVisible();
  await expect(read.getByText("Monday · Reviews")).toHaveCount(0);
  // Deciding happens on the review page, so there is no Accept anywhere on Today.
  await expect(page.getByRole("button", { name: "Accept" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Decline" })).toHaveCount(0);
  await expect(read.getByRole("link", { name: /Read the full review/ })).toHaveAttribute("href", `/me/weekly/${REVIEW_ONLY}`);

  const [readBox, missionsBox] = await Promise.all([read.boundingBox(), missions(page).boundingBox()]);
  expect(readBox?.y ?? 0).toBeLessThan(missionsBox?.y ?? 0);
});

test("dismissing hides the card and it stays hidden after a reload", async ({ page }) => {
  await signInAs(page, "weekly-read@e2e.test");
  await expect(card(page)).toBeVisible();

  await page.getByRole("button", { name: "Dismiss until next week" }).click();
  await expect(card(page)).toBeHidden();
  // The stored value is the review's weekStart, which is the entire keying rule.
  expect(await page.evaluate((key) => localStorage.getItem(key), DISMISSED_KEY)).toBe(WEEK_OLD);

  await page.reload();
  await expect(card(page)).toBeHidden();
  // Today still works without it.
  await expect(missions(page).getByRole("listitem").first()).toBeVisible();
  // Ren's gradient is a single id shared by every mark on the page. A dismissed
  // card must not leave a hidden definition behind that steals the coach line's
  // sphere (a hidden SVG's gradient does not paint for the visible one).
  await expect(page.locator('svg:has(radialGradient[id="ren-lit"])').first()).toBeVisible();
});

test("a dismissal of last week's review does not hide this week's", async ({ page }) => {
  // Dismiss the previous review on this device...
  await signInAs(page, "weekly-read@e2e.test");
  await expect(card(page)).toBeVisible();
  await page.getByRole("button", { name: "Dismiss until next week" }).click();
  expect(await page.evaluate((key) => localStorage.getItem(key), DISMISSED_KEY)).toBe(WEEK_OLD);

  // ...then the newer review arrives for the same device. The stored weekStart is
  // still the older one, so the card has to come back on its own.
  await signInAs(page, "weekly-new@e2e.test");
  const read = card(page);
  await expect(read).toBeVisible();
  await expect(read.getByText("The newer read, and the one the card should show.")).toBeVisible();
  // The older review for the same user is not what a card shows.
  await expect(read.getByText("An earlier read that the newer one replaces.")).toHaveCount(0);
  await expect(read.getByRole("link", { name: /Read the full review/ })).toHaveAttribute("href", `/me/weekly/${REVIEW_NEWER}`);
});

test("a decided review still shows its read and has nothing left to decide", async ({ page }) => {
  await signInAs(page, "weekly-decided@e2e.test");
  const read = card(page);
  await expect(read).toBeVisible();
  await expect(read.getByText("A read you have already answered.")).toBeVisible();
  // `accepted` is a boolean or null; the read is the same either way, and the
  // full review is still one link away.
  await expect(read.getByRole("link", { name: /Read the full review/ })).toHaveAttribute("href", `/me/weekly/${REVIEW_DECIDED}`);
  await expect(page.getByRole("button", { name: "Accept" })).toHaveCount(0);
});

test("a user with no weekly review sees Today unchanged", async ({ page }) => {
  await signIn(page, "weekly-none");
  await expect(card(page)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Missions" })).toBeVisible();
  await expect(page.getByRole("img", { name: /of 90 days done/ })).toBeVisible();
  // The desktop readiness strip is untouched.
  await expect(page.getByText("Readiness", { exact: true })).toBeVisible();
  await expect(page.getByText("Reviews due", { exact: true })).toBeVisible();
});

// The card is the same on a phone and a desktop now: it names the count and
// links to the review, and the changes themselves live on the review page. Only
// the count's wording differs — the phone adds "decided on the review".
test("the card shows the count and the full-review link on every breakpoint", { tag: "@mobile" }, async ({ page, isMobile }) => {
  await signInAs(page, "weekly-new@e2e.test");
  const read = card(page);
  await expect(read).toBeVisible();
  await expect(read.getByText("The newer read, and the one the card should show.")).toBeVisible();

  if (isMobile) {
    await expect(read.getByText("2 suggested changes, decided on the review")).toBeVisible();
  } else {
    await expect(read.getByText("2 suggested changes", { exact: true })).toBeVisible();
  }
  await expect(read.getByText("Tuesday · New problems")).toHaveCount(0);
  await expect(read.getByRole("link", { name: /Read the full review/ })).toHaveAttribute("href", `/me/weekly/${REVIEW_NEWER}`);

  // The desktop readiness strip has no place on a phone, and is unchanged.
  if (isMobile) await expect(page.getByText("Reviews due", { exact: true })).toBeHidden();
});
