import { expect, type Page, test } from "@playwright/test";
import { fakeReply } from "./fake-model-data";
import { signIn } from "./helpers";

// The coach chat's working state. e2e/fake-model.ts plays back a tool script
// for each of these messages (see TOOL_SCRIPTS), and the coach's tools run for
// real against the seeded database, so the steps below see real tool results.

// Keyed in TOOL_SCRIPTS, so the fake model and this spec stay in step.
const TOOLS_MSG = "Coach, check my weak spots with the tools";
const FAIL_MSG = "Coach, check my weak spots and break one";
const PROPOSAL_MSG = "Coach, suggest a problem for me";

const composer = (page: Page) => page.getByLabel("Message Coach", { exact: true });
/** The messages, without the thread list and the title, which repeat the first message. */
const conversation = (page: Page) => page.locator('[aria-live="polite"]');

test("a reply with tool calls streams one working line with a progress count", async ({ page }) => {
  await signIn(page, "chat-state", { next: "/coach?new=1" });

  await composer(page).fill(TOOLS_MSG);
  await composer(page).press("Enter");

  // One quiet line carrying the current activity and a rising count — not a
  // flat list of "Looked up…" rows per tool call.
  await expect(page.getByText(/of \d+ checks done/)).toBeVisible();
  await expect(conversation(page).getByText(/^Looked up/)).toHaveCount(0);
});

test("the finished reply folds its steps behind Checked N things, which expands", async ({ page }) => {
  await signIn(page, "chat-state-checked", { next: "/coach?new=1" });

  await composer(page).fill(TOOLS_MSG);
  await composer(page).press("Enter");
  await expect(page.getByText(fakeReply(TOOLS_MSG), { exact: true })).toBeVisible();

  // Collapsed: one "Checked N things" line, and no individual steps on screen.
  const fold = page.getByRole("button", { name: "Checked 3 things" });
  await expect(fold).toBeVisible();
  await expect(conversation(page).getByText(/^Looked up/)).toHaveCount(0);

  // Expanding reveals the individual steps again.
  await fold.click();
  await expect(conversation(page).getByText("Looked up your progress", { exact: true })).toBeVisible();
  await expect(conversation(page).getByText("Looked up your weak spots", { exact: true })).toBeVisible();
  await expect(conversation(page).getByText("Looked up your plan", { exact: true })).toBeVisible();
});

test("a failed step is visible without expanding", async ({ page }) => {
  await signIn(page, "chat-state-fail", { next: "/coach?new=1" });

  await composer(page).fill(FAIL_MSG);
  await composer(page).press("Enter");
  await expect(page.getByText(fakeReply(FAIL_MSG), { exact: true })).toBeVisible();

  // The failure is in the collapsed label itself, no expanding needed.
  await expect(page.getByRole("button", { name: /Checked 2 things/ })).toBeVisible();
  await expect(page.getByText(/1 couldn't be checked/)).toBeVisible();
});

test("a proposal still renders as its own card", async ({ page }) => {
  await signIn(page, "chat-state-proposal", { next: "/coach?new=1" });

  await composer(page).fill(PROPOSAL_MSG);
  await composer(page).press("Enter");
  await expect(page.getByText(fakeReply(PROPOSAL_MSG), { exact: true })).toBeVisible();

  // The proposal is a card with its Confirm action, not a folded step.
  await expect(page.getByText(/Add Two Sum to today/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Add to today", exact: true })).toBeVisible();
});

test("Stop still stops the run", async ({ page }) => {
  await signIn(page, "chat-state-stop", { next: "/coach?new=1" });

  await composer(page).fill(TOOLS_MSG);
  await composer(page).press("Enter");
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Stop", exact: true }).click();

  // Once stopped, the run is over and the Stop button is gone.
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toHaveCount(0);
});

test("End still ends the thread", async ({ page }) => {
  await signIn(page, "chat-state-end", { next: "/coach?new=1" });

  await composer(page).fill("What should I focus on this week?");
  await composer(page).press("Enter");
  await expect(page.getByText(fakeReply("What should I focus on this week?"), { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "End", exact: true }).click();
  await expect(page.getByRole("button", { name: "End", exact: true })).toHaveCount(0);
});

test("the composer shows the offline placeholder when offline", async ({ page, context }) => {
  await signIn(page, "chat-state-offline", { next: "/coach?new=1" });

  await expect(composer(page)).toHaveAttribute("placeholder", "Ask the coach");
  await context.setOffline(true);
  await expect(composer(page)).toHaveAttribute("placeholder", "You're offline");
  await context.setOffline(false);
});
