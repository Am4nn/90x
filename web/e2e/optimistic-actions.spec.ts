import { expect, type Page, type Route, test } from "@playwright/test";
import { feedCard, openFeedCard, openMissions, seededCard, signIn } from "./helpers";
import { correctOption } from "./seed-data";

// An action button answers on the frame of the tap: the new state shows while the
// server action is still in flight. Every server action is a POST with a
// `next-action` header, so holding those back by two seconds proves it.

const SLOW_MS = 2000;
// One frame plus a margin for a loaded CI box. Far below SLOW_MS, so passing means "before the server".
const INSTANT = 150;

const isAction = (route: Route) => route.request().method() === "POST" && "next-action" in route.request().headers();

/** Hold every server action for two seconds before it reaches the server. */
async function slowActions(page: Page) {
  await page.route("**/*", async (route) => {
    if (isAction(route)) await new Promise((resolve) => setTimeout(resolve, SLOW_MS));
    await route.continue();
  });
}

/** Make every server action fail at the network. */
async function failingActions(page: Page) {
  await page.route("**/*", (route) => (isAction(route) ? route.abort() : route.continue()));
}

/** Sign in, open the Feed past the diagnostic, answer a pick-one card; the footer's stars are showing. */
async function answeredFeedCard(page: Page, name: string) {
  const card = seededCard((c) => c.primitive === "pick_one", "pick_one");
  await openFeedCard(page, name, card.promptMd);
  await page.getByRole("list", { name: "Options" }).getByRole("button").nth(correctOption(card)).click();
  await page.getByRole("button", { name: "Check answer", exact: true }).click();
  await expect(feedCard(page).getByRole("button", { name: "Next card", exact: true })).toBeVisible();
  return page.getByRole("group", { name: "Rate this card" }).getByRole("button", { name: "4 of 5, Good" });
}

test("a mission's Mark studied flips on the tap, before the server answers", async ({ page }) => {
  await signIn(page, "optimistic-mission");
  const row = openMissions(page)
    .filter({ has: page.getByRole("button", { name: "Mark studied", exact: true }) })
    .first();
  await expect(row).toBeVisible();
  const title = (await row.getByRole("link").innerText()).trim();
  await slowActions(page);

  await row.getByRole("button", { name: "Mark studied", exact: true }).click();
  await expect(
    page
      .getByRole("listitem")
      .filter({ has: page.getByRole("link", { name: title, exact: true }) })
      .getByLabel("Done"),
  ).toBeVisible({
    timeout: INSTANT,
  });
});

test("a Feed star lights on the tap and the card's other controls stay usable", async ({ page }) => {
  const star = await answeredFeedCard(page, "optimistic-star");
  await slowActions(page);

  await star.click();
  await expect(star).toHaveAttribute("aria-pressed", "true", { timeout: INSTANT });
  await expect(star).toBeEnabled();
  await expect(page.getByRole("button", { name: "Report", exact: true })).toBeEnabled();
});

test("a Feed star that fails to save rolls back and says so", async ({ page }) => {
  const star = await answeredFeedCard(page, "optimistic-star-fail");
  await failingActions(page);

  await star.click();
  // By text: Next's route announcer is also an alert.
  await expect(page.getByText("That didn't go through", { exact: false }).first()).toBeVisible();
  await expect(star).toHaveAttribute("aria-pressed", "false");
});

test("a mission that fails to save goes back to open and says so", async ({ page }) => {
  await signIn(page, "optimistic-mission-fail");
  const row = openMissions(page)
    .filter({ has: page.getByRole("button", { name: "Mark studied", exact: true }) })
    .first();
  await expect(row).toBeVisible();
  const title = (await row.getByRole("link").innerText()).trim();
  const same = page.getByRole("listitem").filter({ has: page.getByRole("link", { name: title, exact: true }) });
  await failingActions(page);

  await row.getByRole("button", { name: "Mark studied", exact: true }).click();
  // By text: Next's route announcer is also an alert.
  await expect(page.getByText("That didn't go through", { exact: false }).first()).toBeVisible();
  await expect(same.getByLabel("Open", { exact: true })).toBeVisible();
});
