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
  await signInFixed(inviter, inviterEmail, "/friends");

  // Neither sees the other yet.
  await expect(inviter.getByText("Just you so far")).toBeVisible();

  // Invite the friend, through the confirm step.
  await inviter.getByPlaceholder("friend@example.com").fill(friendEmail);
  await inviter.getByRole("button", { name: "Next" }).click();
  await inviter.getByRole("button", { name: "Send invite" }).click();
  // Names the address, so this also catches the confirmation going to the wrong
  // one. The three outcomes print different sentences; this is the "sent" one.
  await expect(inviter.getByText(`Invite emailed to ${friendEmail}.`)).toBeVisible();

  // Inviting the same address again while that invite is still pending sends
  // nothing, and has to say so rather than repeat "emailed".
  await inviter.getByPlaceholder("friend@example.com").fill(friendEmail);
  await inviter.getByRole("button", { name: "Next" }).click();
  await inviter.getByRole("button", { name: "Send invite" }).click();
  await expect(inviter.getByText(`${friendEmail} already has an invite from you, still waiting. Nothing new was sent.`)).toBeVisible();

  // The friend sees the request on Today and accepts it.
  await friend.reload();
  await expect(friend.getByText(`${inviterName} wants to compare progress.`)).toBeVisible();
  // The card goes on the tap (optimistic); wait for the accept itself to be saved before moving on.
  const saved = friend.waitForResponse((r) => r.request().method() === "POST" && Boolean(r.request().headers()["next-action"]));
  await friend.getByRole("button", { name: "Accept" }).click();
  await expect(friend.getByText(`${inviterName} wants to compare progress.`)).toBeHidden();
  await saved;

  // Now each scoreboard shows the other, instead of "just you".
  await friend.goto("/friends");
  await expect(friend.getByText("Just you so far")).toBeHidden();
  await expect(friend.getByText(inviterName).first()).toBeVisible();

  await inviter.goto("/friends");
  await expect(inviter.getByText("Just you so far")).toBeHidden();
  await expect(inviter.getByText(friendName).first()).toBeVisible();

  await friendCtx.close();
  await inviterCtx.close();
});
