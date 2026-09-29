import { expect, type Page, test } from "@playwright/test";
import { signIn } from "./helpers";

// startMockAction redirects to the interview thread on success, so a passing start
// is a URL change, never a message on this page.
const MOCK_THREAD = /\/coach\?kind=mock&ref=[0-9a-f-]{36}&thread=[0-9a-f-]{36}$/;

const picker = (page: Page) => page.getByRole("combobox", { name: "Problem" });
const start = (page: Page) => page.getByRole("button", { name: "Start design mock", exact: true });

test("typing filters the topics, choosing one fills the box, and the mock starts", async ({ page }) => {
  await signIn(page, "mock-pick", { next: "/coach/mocks" });
  const box = picker(page);
  await expect(box).toHaveAttribute("aria-expanded", "false");

  await box.fill("cach");
  await expect(box).toHaveAttribute("aria-expanded", "true");
  const options = page.getByRole("option");
  await expect(options).toHaveCount(1);
  await options.first().click();

  await expect(box).toHaveValue("Caching");
  await expect(box).toHaveAttribute("aria-expanded", "false");
  await start(page).click();
  await expect(page).toHaveURL(MOCK_THREAD);
});

test("the box shows the short label and the form posts the full topic name", async ({ page }) => {
  await signIn(page, "mock-label", { next: "/coach/mocks" });
  const box = picker(page);

  // "design" matches the raw names, not the labels shown in the list.
  await box.fill("design");
  await expect(page.getByRole("option")).toHaveCount(2);

  await box.fill("url");
  const only = page.getByRole("option");
  await expect(only).toHaveCount(1);
  // Options now carry a right-aligned area label, so the row text is longer than the label.
  await expect(only).toContainText("URL shortener");
  await only.click();

  // The visible value is the short label; the hidden field carries the full name, and
  // startMock refuses anything that is not in designTopics() - so reaching the thread is
  // the proof that the full name was posted and not the label.
  await expect(box).toHaveValue("URL shortener");
  await start(page).click();
  await expect(page).toHaveURL(MOCK_THREAD);

  await page.goto("/coach/mocks");
  await expect(page.getByRole("link", { name: /Design a URL shortener/ })).toBeVisible();
});

test("a search with no match says so, and leaving the box restores the chosen topic", async ({ page }) => {
  await signIn(page, "mock-none", { next: "/coach/mocks" });
  const box = picker(page);
  await box.fill("zzzz");
  await expect(page.getByRole("option")).toHaveCount(0);
  await expect(page.getByText("No topics match.")).toBeVisible();

  await page.getByRole("heading", { name: "Mock interviews" }).click();
  await expect(box).toHaveValue("Caching");
});

test("the picker works from the keyboard alone", async ({ page }) => {
  await signIn(page, "mock-keys", { next: "/coach/mocks" });
  const box = picker(page);
  await box.focus();

  await box.press("ArrowDown");
  await expect(box).toHaveAttribute("aria-expanded", "true");
  const first = page.getByRole("option").first();
  await expect(box).toHaveAttribute("aria-activedescendant", (await first.getAttribute("id")) ?? "");
  await expect(first).toHaveAttribute("aria-selected", "true");

  await box.press("Escape");
  await expect(box).toHaveAttribute("aria-expanded", "false");

  await box.press("ArrowDown");
  await box.press("Enter");
  await expect(box).toHaveValue("Caching");
  await expect(page).not.toHaveURL(MOCK_THREAD);

  // With the list closed, Enter submits the form.
  await box.press("Enter");
  await expect(page).toHaveURL(MOCK_THREAD);
});

test("starting without touching the picker uses the default topic", async ({ page }) => {
  await signIn(page, "mock-default", { next: "/coach/mocks" });
  await start(page).click();
  await expect(page).toHaveURL(MOCK_THREAD);
});

test("with no stories the behavioral mock says why and does not start", async ({ page }) => {
  await signIn(page, "mock-nostory", { next: "/coach/mocks" });
  await expect(page.getByText("so a mock has nothing to ask without at least one STAR story")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open Story bank", exact: true })).toHaveAttribute("href", "/me/stories");
  // The mock drops the dead start button when there is no story to ask about.
  await expect(page.getByRole("button", { name: "Start behavioural mock", exact: true })).toHaveCount(0);
});

test("with a story the behavioral mock starts and the story bank link stays", async ({ page }) => {
  await signIn(page, "mock-story", { next: "/me/stories" });
  await page.getByLabel("Title").fill("Migrated billing without downtime");
  await page.getByRole("button", { name: "Add story", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Migrated billing without downtime" })).toBeVisible();

  await page.goto("/coach/mocks");
  await expect(page.getByRole("link", { name: "Manage your story bank", exact: true })).toHaveAttribute("href", "/me/stories");
  await page.getByRole("button", { name: "Start behavioural mock", exact: true }).click();
  await expect(page).toHaveURL(MOCK_THREAD);
});

test("past mocks are still listed", async ({ page }) => {
  await signIn(page, "mock-past", { next: "/coach/mocks" });
  await expect(page.getByText("No mocks yet")).toBeVisible();

  await start(page).click();
  await expect(page).toHaveURL(MOCK_THREAD);

  await page.goto("/coach/mocks");
  await expect(page.getByRole("heading", { name: "Past mocks" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Caching/ })).toContainText("Design");
});
