import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

// Two signed-in users, each blind to the other, then invite → accept → each
// appears on the other's scoreboard. Uses a fixed email per session (instead of
// the helpers.signIn random one) so the inviter can address the invite to it.

const email = (name: string) => `${name}-${randomUUID().slice(0, 8)}@e2e.test`;

async function signInFixed(page: Page, address: string, next: string) {
  await page.goto(`/api/test/sign-in?${new URLSearchParams({ email: address, next })}`);
  await expect(page).toHaveURL(next);
}

test("an accepted invite makes the two users friends", async ({ browser }) => {
  const inviterEmail = email("inviter");
  const friendEmail = email("friend");
  // prepare() names each user after their email prefix.
  const inviterName = inviterEmail.split("@")[0] ?? "inviter";
  const friendName = friendEmail.split("@")[0] ?? "friend";

  const friendCtx = await browser.newContext();
  const friend = await friendCtx.newPage();
  await signInFixed(friend, friendEmail, "/today");

  const inviterCtx = await browser.newContext();
  const inviter = await inviterCtx.newPage();
  await signInFixed(inviter, inviterEmail, "/me");

  // Neither sees the other yet.
  await expect(inviter.getByText("Just you so far")).toBeVisible();

  // Invite the friend, through the confirm step.
  await inviter.getByPlaceholder("friend@example.com").fill(friendEmail);
  await inviter.getByRole("button", { name: "Next" }).click();
  await inviter.getByRole("button", { name: "Send invite" }).click();
  await expect(inviter.getByText("Invite sent.")).toBeVisible();

  // The friend sees the request on Today and accepts it.
  await friend.reload();
  await expect(friend.getByText(`${inviterName} wants to compare progress.`)).toBeVisible();
  await friend.getByRole("button", { name: "Accept" }).click();
  await expect(friend.getByText(`${inviterName} wants to compare progress.`)).toBeHidden();

  // Now each scoreboard shows the other, instead of "just you".
  await friend.goto("/me");
  await expect(friend.getByText("Just you so far")).toBeHidden();
  await expect(friend.getByText(inviterName).first()).toBeVisible();

  await inviter.goto("/me");
  await expect(inviter.getByText("Just you so far")).toBeHidden();
  await expect(inviter.getByText(friendName).first()).toBeVisible();

  await friendCtx.close();
  await inviterCtx.close();
});
