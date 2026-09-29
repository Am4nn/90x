import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./helpers";

// Two signed-in users for the accept flow, each with a fixed email so the
// inviter can address the invite to it (mirrors friends.spec.ts).
const email = (name: string) => `${name}-${randomUUID().slice(0, 8)}@e2e.test`;

async function signInFixed(page: Page, address: string, next: string) {
  await page.goto(`/api/test/sign-in?${new URLSearchParams({ email: address, next })}`);
  await expect(page).toHaveURL(next);
}

test("Me keeps readiness, weakest patterns and This week, and drops the moved blocks", async ({ page }) => {
  await signIn(page, "me-strip", { next: "/me" });
  await expect(page.getByRole("heading", { name: "Me", exact: true })).toBeVisible();
  await expect(page.getByText("Readiness", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Weakest patterns" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "This week" })).toBeVisible();

  // Moved off Me: the invite form, the friends activity list, interview practice,
  // "What Coach knows" and sign out.
  await expect(page.getByRole("heading", { name: "Invite a friend", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Friends", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Interview practice", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /What Coach knows/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Sign out" })).toHaveCount(0);
});

test("the mobile tab bar has five entries and the desktop sidebar has six", async ({ page }) => {
  await signIn(page, "me-nav", { next: "/me" });

  await page.setViewportSize({ width: 390, height: 844 });
  const tabbar = page.getByRole("navigation", { name: "Main" });
  await expect(tabbar).toBeVisible();
  await expect(tabbar.getByRole("link")).toHaveCount(5);
  await expect(tabbar.getByRole("link", { name: "Friends" })).toHaveCount(0);
  await expect(page.locator("aside")).toBeHidden();

  await page.setViewportSize({ width: 1440, height: 900 });
  const sidebar = page.locator("aside");
  await expect(sidebar).toBeVisible();
  for (const label of ["Today", "Feed", "Library", "Coach", "Friends", "Me"]) {
    await expect(sidebar.getByRole("link", { name: label, exact: true })).toBeVisible();
  }
  await expect(page.getByRole("navigation", { name: "Main" })).toBeHidden();
});

test("on a phone, Me links to Friends, which shows the scoreboard and the invite form", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, "me-friends", { next: "/me" });
  await page.getByRole("link", { name: "Friends" }).click();
  await expect(page).toHaveURL(/\/friends$/);
  await expect(page.getByRole("heading", { name: "Friends", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "This week" })).toBeVisible();
  await expect(page.getByText("Just you so far")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Invite a friend", exact: true })).toBeVisible();
});

test("Settings shows Account, What Coach knows and Sign out, and no LeetCode", async ({ page }) => {
  await signIn(page, "me-settings", { next: "/me/settings" });
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Account" })).toBeVisible();
  await expect(page.getByText("Email", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /What Coach knows/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "LeetCode" })).toHaveCount(0);
});

test("accepting a pending request on /friends clears it", async ({ browser }) => {
  const inviterEmail = email("inv");
  const friendEmail = email("fri");
  const inviterName = inviterEmail.split("@")[0] ?? "inv";

  const inviterCtx = await browser.newContext();
  const inviter = await inviterCtx.newPage();
  await signInFixed(inviter, inviterEmail, "/friends");
  await inviter.getByPlaceholder("friend@example.com").fill(friendEmail);
  await inviter.getByRole("button", { name: "Next" }).click();
  await inviter.getByRole("button", { name: "Send invite" }).click();
  await expect(inviter.getByText(`Invite emailed to ${friendEmail}.`)).toBeVisible();

  const friendCtx = await browser.newContext();
  const friend = await friendCtx.newPage();
  await signInFixed(friend, friendEmail, "/friends");
  await expect(friend.getByText(`${inviterName} wants to compare progress.`)).toBeVisible();

  // Accepting revalidates /friends: the request clears and the scoreboard gains
  // the inviter, both in the same server round-trip.
  await friend.getByRole("button", { name: "Accept" }).click();
  await expect(friend.getByText(`${inviterName} wants to compare progress.`)).toBeHidden();
  await expect(friend.getByText("Just you so far")).toBeHidden();
  await expect(friend.getByText(inviterName).first()).toBeVisible();

  await inviterCtx.close();
  await friendCtx.close();
});
