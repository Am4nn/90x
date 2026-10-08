import { expect, type Page, test } from "@playwright/test";
import { gotoToday, missions, signIn } from "./helpers";
import { LIVE_CARDS } from "./seed-data";

// Today is readable offline; the Feed serves saved cards offline and
// grades the answers once back online.

const offlineBanner = (page: Page) => page.getByText(/^You're offline\. Showing today as of \d{2}:\d{2}\.$/);

test("Today stays readable offline, with mission actions locked", { tag: "@mobile" }, async ({ page, context }) => {
  await signIn(page, "offline");
  await expect(missions(page)).toBeVisible();

  // The open page loses its connection.
  await context.setOffline(true);
  await expect(offlineBanner(page)).toBeVisible();
  for (const action of await missions(page).getByRole("button").all()) await expect(action).toBeDisabled();
  await context.setOffline(false);
  await expect(offlineBanner(page)).toBeHidden();

  // With the service worker in control, an online visit keeps a copy of the page...
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await gotoToday(page);
  await expect
    .poll(() => page.evaluate(async () => Boolean(await caches.match("/today", { ignoreVary: true }))), { timeout: 10_000 })
    .toBe(true);

  // ...which is what a reload shows offline.
  await context.setOffline(true);
  await page.reload();
  await expect(offlineBanner(page)).toBeVisible();
  await expect(missions(page).getByRole("listitem").first()).toBeVisible();
  await context.setOffline(false);
});

/** The offline copy of Today the service worker holds, as text ("" when there is none). */
const cachedToday = (page: Page) => page.evaluate(async () => (await (await caches.match("/today", { ignoreVary: true }))?.text()) ?? "");

test("a different person signing in on this device forgets the last person's offline copies", async ({ page }) => {
  await signIn(page, "offline-owner-a");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await gotoToday(page);
  // The owner is recorded once the cleanup is confirmed, so it can land a moment after the page.
  const owner = () => page.evaluate(() => localStorage.getItem("90x:offline-owner"));
  await expect.poll(owner).not.toBeNull();
  const first = String(await owner());
  // The kept page is this person's: their id travels in the page's own data.
  await expect.poll(() => cachedToday(page), { timeout: 10_000 }).toContain(first);

  // Someone else signs in here without passing the landing page (an expired session, a second tab).
  await signIn(page, "offline-owner-b");
  await expect.poll(owner).not.toBe(first);
  await expect.poll(() => cachedToday(page), { timeout: 10_000 }).not.toContain(first);
});

/** Cards the Feed has saved on this device. Never opens the database itself before the app has made it. */
const savedCards = (page: Page) =>
  page.evaluate(async () => {
    if (!(await indexedDB.databases()).some((d) => d.name === "90x-offline")) return 0;
    return new Promise<number>((resolve) => {
      const request = indexedDB.open("90x-offline");
      request.addEventListener("error", () => resolve(0));
      request.addEventListener("success", () => {
        const db = request.result;
        const rows = db.transaction("cards").objectStore("cards").getAll();
        rows.addEventListener("error", () => resolve(0));
        rows.addEventListener("success", () => {
          resolve((rows.result as { cards: unknown[] }[]).reduce((n, row) => n + row.cards.length, 0));
          db.close();
        });
      });
    });
  });

/** The seeded card on screen, by its prompt. */
async function shownPrompt(page: Page) {
  await expect(page.getByRole("button", { name: "Skip", exact: true })).toBeVisible();
  for (const card of LIVE_CARDS) {
    if (await page.getByText(card.promptMd, { exact: true }).isVisible()) return card.promptMd;
  }
  throw new Error("The Feed is showing a card that isn't in the e2e seed");
}

test("the Feed serves saved cards offline and grades those answers on reconnect", async ({ page, context }) => {
  await signIn(page, "offline-feed", { next: "/feed" });
  await page.getByRole("button", { name: "Skip for now", exact: true }).click();
  const first = await shownPrompt(page);
  await expect.poll(() => savedCards(page), { timeout: 10_000 }).toBeGreaterThan(1);

  await context.setOffline(true);
  await expect(page.getByText("You're offline. Answers are saved on this device and graded when you're back online.")).toBeVisible();
  // A skip, so grading needs no AI when it's sent.
  await page.getByRole("article").getByRole("button", { name: "Skip", exact: true }).click();
  await expect(page.getByText("Saved. It'll be graded when you're back online.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next card", exact: true }).click();
  await expect(page.getByText(first, { exact: true })).toHaveCount(0);
  await shownPrompt(page);

  await context.setOffline(false);
  await expect(page.getByText("1 answer graded", { exact: true })).toBeVisible();
});
