import { type APIRequestContext, expect, type Page, test } from "@playwright/test";
import { FAKE_MODEL_URL, FAKE_REVIEW, fakeReply, type SeenRequest } from "./fake-model-data";
import { signIn } from "./helpers";
import { PROBLEMS } from "./seed-data";

// The coach talks to e2e/fake-model.ts, which CI starts in place of the AI
// provider: every reply is fakeReply(message), streamed in a few chunks. The
// specs check both what the page shows and which prompt reached the model.

const composer = (page: Page) => page.getByLabel("Message Coach", { exact: true });
/** The messages, without the thread list and the title, which repeat the first message. */
const conversation = (page: Page) => page.locator('[aria-live="polite"]');

/** Wait for the coach's streamed answer to `message`, then for the stream to end. */
async function expectReply(page: Page, message: string) {
  await expect(page.getByText(fakeReply(message), { exact: true })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Coach is working" })).toHaveCount(0);
}

/** The latest request the model got that matches, once it has arrived. */
async function modelGot(request: APIRequestContext, matches: (r: SeenRequest) => boolean): Promise<SeenRequest> {
  let found: SeenRequest | undefined;
  await expect
    .poll(async () => {
      const seen = (await (await request.get(`${FAKE_MODEL_URL}/requests`)).json()) as SeenRequest[];
      found = seen.findLast(matches);
      return Boolean(found);
    })
    .toBe(true);
  return found!;
}

/** The chat request the model got for `message`. */
const promptFor = (request: APIRequestContext, message: string) => modelGot(request, (r) => !r.json && r.user === message);

test("a chat message streams back a reply that's still there after a reload", { tag: "@mobile" }, async ({ page, request }) => {
  await signIn(page, "coach-chat", { next: "/coach?new=1" });
  await expect(page.getByRole("heading", { name: "New chat", exact: true })).toBeVisible();

  const message = "How should I split my week between DSA and system design?";
  await composer(page).fill(message);
  await composer(page).press("Enter");

  await expect(conversation(page).getByText(message, { exact: true })).toBeVisible();
  // The fake model takes a moment per chunk, so the stream is visibly in flight.
  await expect(page.getByRole("status").filter({ hasText: "Coach is working" })).toBeVisible();
  await expectReply(page, message);
  await expect(composer(page)).toHaveValue("");

  const prompt = await promptFor(request, message);
  expect(prompt.system).toContain("You are Coach, the interview-prep coach inside 90x");

  // The thread went into the URL with the first message and the answer was saved.
  await expect(page).toHaveURL(/\/coach\?t=[0-9a-f-]{36}$/);
  await page.reload();
  await expect(page.getByRole("heading", { name: message, exact: true })).toBeVisible();
  await expect(conversation(page).getByText(message, { exact: true })).toBeVisible();
  await expect(conversation(page).getByText(fakeReply(message), { exact: true })).toBeVisible();
});

test("a starter question opens the chat without typing", async ({ page }) => {
  await signIn(page, "coach-starter", { next: "/coach?new=1" });
  const starter = "What should I focus on this week?";
  await page.getByRole("button", { name: starter, exact: true }).click();
  await expectReply(page, starter);
  // Starters only offer the first message.
  await expect(page.getByRole("button", { name: starter, exact: true })).toHaveCount(0);
});

test("Teach me this pattern in the Library opens a lesson on that pattern", async ({ page, request }) => {
  await signIn(page, "coach-lesson", { next: "/library" });
  const selected = page.getByText(/^Selected:/);
  const pattern = (await selected.locator("span").innerText()).trim();
  await page.getByRole("link", { name: "Teach me this pattern", exact: true }).click();

  await expect(page).toHaveURL(/\/coach\?kind=lesson&ref=/);
  await expect(page.getByRole("heading", { name: "Lesson", exact: true })).toBeVisible();
  const starter = "Teach me this pattern";
  await page.getByRole("button", { name: starter, exact: true }).click();
  await expectReply(page, starter);

  const prompt = await promptFor(request, starter);
  expect(prompt.system).toContain(`teaching the ${pattern} pattern`);
});

test("a solution review opens a Coach thread about that review", async ({ page, request }) => {
  const problem = PROBLEMS[0]!;
  await signIn(page, "coach-review", { next: `/library/problem/${problem.slug}/review` });
  const code = "def two_sum(nums, target):\n    return [0, 1]";
  await page.getByLabel("Your code", { exact: true }).fill(code);
  await page.getByRole("button", { name: "Review my solution", exact: true }).click();

  // The review itself is one structured call; the page shows what the model returned.
  await expect(page).toHaveURL(new RegExp(`/library/problem/${problem.slug}/review/[0-9a-f-]{36}$`));
  await expect(page.getByRole("heading", { name: "Solution review", exact: true })).toBeVisible();
  await expect(page.getByText(FAKE_REVIEW.betterApproach, { exact: true })).toBeVisible();
  await expect(page.getByText(FAKE_REVIEW.patternLesson, { exact: true })).toBeVisible();
  const reviewCall = await modelGot(request, (r) => r.json && r.system.includes("reviewing one person's solution"));
  expect(reviewCall.user).toContain("return [0, 1]");

  await page.getByRole("link", { name: "Discuss with Coach", exact: true }).click();
  await expect(page).toHaveURL(/\/coach\?kind=review&ref=/);
  const starter = "Walk me through the review";
  await page.getByRole("button", { name: starter, exact: true }).click();
  await expectReply(page, starter);

  const prompt = await promptFor(request, starter);
  expect(prompt.system).toContain("follow-up questions about a solution review");
  expect(prompt.system).toContain(`Problem: ${problem.title}`);
  expect(prompt.system).toContain("return [0, 1]");
});

test("starting a design mock opens the interview in Coach", async ({ page, request }) => {
  await signIn(page, "coach-mock", { next: "/coach/mocks" });
  await page.getByRole("button", { name: "Start design mock", exact: true }).click();

  await expect(page).toHaveURL(/\/coach\?kind=mock&ref=[0-9a-f-]{36}&thread=[0-9a-f-]{36}$/);
  // The interviewer's opening is saved with the mock, before any model call.
  await expect(page.getByText(/system design interview\. Today:/)).toBeVisible();
  const topic = (await page.locator("strong").filter({ hasText: /\S/ }).first().innerText()).trim();

  const message = "I'd start with the read path and a cache in front of the database.";
  await composer(page).fill(message);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expectReply(page, message);

  const prompt = await promptFor(request, message);
  expect(prompt.system).toContain("You are the interviewer in a text mock interview");
  expect(prompt.system).toContain(topic);
});
