import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { LIVE_CARDS, type SeedCard } from "./seed-data";

/**
 * Signs in through the test-only route (src/app/api/test/sign-in) as a new
 * user, approved, set up and on a fresh campaign. Every call makes a new user,
 * so tests, projects and retries never share a day's state. Every day has a
 * "10 cards" mission, which the sign-in route skips so a day can be finished
 * without the Feed; `cards` keeps it open. `setup` leaves Set up undone so a
 * spec can walk it itself. `missed` starts the plan two days ago so Today offers
 * to revive; `answered` gives the user that many answered cards today.
 */
export async function signIn(
  page: Page,
  name: string,
  options: { admin?: boolean; cards?: boolean; setup?: boolean; missed?: boolean; answered?: number; next?: string } = {},
) {
  const next = options.next ?? "/today";
  const params = new URLSearchParams({ email: `${name}-${randomUUID().slice(0, 8)}@e2e.test`, next });
  if (options.admin) params.set("admin", "1");
  if (options.cards) params.set("cards", "1");
  if (options.setup) params.set("setup", "1");
  if (options.missed) params.set("missed", "1");
  if (options.answered) params.set("answered", String(options.answered));
  await page.goto(`/api/test/sign-in?${params}`);
  await expect(page).toHaveURL(next);
}

export const missions = (page: Page) => page.getByRole("list", { name: "Missions" });

/** Open Today and wait for the missions to stream in behind the skeleton. */
export async function gotoToday(page: Page) {
  await page.goto("/today");
  await expect(missions(page)).toBeVisible();
}

export const openMissions = (page: Page) =>
  missions(page)
    .getByRole("listitem")
    .filter({ has: page.getByLabel("Open", { exact: true }) });

/** The Today row for a mission, by its exact title ("Two Sum" must not match "Two Sum II"). */
export const missionRow = (page: Page, title: string) =>
  missions(page)
    .getByRole("listitem")
    .filter({ has: page.getByRole("link", { name: title, exact: true }) });

async function press(page: Page, name: string) {
  const chip = page.getByRole("button", { name, exact: true });
  if ((await chip.getAttribute("aria-pressed")) !== "true") await chip.click();
  await expect(chip).toHaveAttribute("aria-pressed", "true");
}

/** On a problem page: check in as solved in 30 minutes. */
export async function checkInSolved(page: Page) {
  await press(page, "Solved");
  await press(page, "30m");
  await page.getByRole("button", { name: "Check in", exact: true }).click();
  await expect(page.getByText("Checked in.")).toBeVisible();
}

/** Finish the first open mission on Today the way a user would. */
export async function finishOne(page: Page) {
  const row = openMissions(page).first();
  const link = row.getByRole("link");
  const href = (await link.getAttribute("href")) ?? "";
  const title = (await link.innerText()).trim();
  if (href.startsWith("/library/problem/")) {
    await page.goto(href);
    await checkInSolved(page);
    return;
  }
  const button = row.getByRole("button", { name: /^(Mark studied|Not today)$/ });
  if (await button.count()) {
    // Wait for this server action itself: navigating away first would cancel it.
    // Its request names the mission's topic; the app's own background actions
    // (offline cards) are POSTs too, so any POST isn't enough.
    const ref = decodeURIComponent(href.split("/").pop() ?? "");
    await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && (r.request().postData() ?? "").includes(ref)),
      button.click(),
    ]);
    return;
  }
  // The sign-in route skips the day's "10 cards" mission; an open one needs the Feed.
  throw new Error(`No way to finish "${title}" (${href}) from this test`);
}

/** The one card on screen, by its `<article>` role. */
export const feedCard = (page: Page) => page.getByRole("article");

/**
 * Sign in on the Feed, skip the diagnostic, then skip cards until the card
 * whose prompt matches `prompt` is on screen. Shared by the mapping and
 * ordering specs so their helpers stay in one place.
 */
export async function openFeedCard(page: Page, name: string, prompt: string) {
  await signIn(page, name, { next: "/feed" });
  await page.getByRole("button", { name: "Skip for now", exact: true }).click();
  for (let i = 0; i < 40; i++) {
    // The Skip button marks the ask phase: waiting on it means the next card's
    // prompt has rendered, so the prompt check below cannot race the transition.
    await expect(feedCard(page).getByRole("button", { name: "Skip", exact: true })).toBeVisible();
    if (await page.getByText(prompt, { exact: true }).isVisible()) return;
    const before = await feedCard(page).innerText();
    await feedCard(page).getByRole("button", { name: "Skip", exact: true }).click();
    await expect(feedCard(page)).not.toHaveText(before);
  }
  throw new Error(`card not reached: ${prompt}`);
}

/** A seeded card matching `predicate`, or throw. `what` names it in the error. */
export function seededCard(predicate: (card: SeedCard) => boolean, what: string): SeedCard {
  const card = LIVE_CARDS.find(predicate);
  if (!card) throw new Error(`no ${what} card in the seed`);
  return card;
}
