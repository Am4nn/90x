import { expect, type Page, test } from "@playwright/test";
import { signIn } from "./helpers";

// Audio lessons. The e2e build sets NEXT_PUBLIC_E2E_AUDIO_SRC=/e2e/tone.mp3 (ci.yml), so the player plays a
// 30 s local file instead of asking R2 for a signed URL; the four AUDIO_R2_* variables are set to "e2e" so the
// listen bar shows. Everything else is real: the seeded lesson_audio row (scripts/seed-e2e.ts), the bar, the
// provider in the (app) layout and the mini-player.

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 0) < 768;

/** On desktop Listen opens Now playing by itself; on a phone it is opened from the bottom bar. */
async function openPlayer(page: Page) {
  if (isPhone(page))
    await page
      .getByRole("button", { name: /^Open player, Caching/ })
      .filter({ visible: true })
      .click();
  await expect(page.getByRole("dialog").getByText("Now playing")).toBeVisible();
}

test("Listen keeps playing across navigation and the mini-player shows", async ({ page }) => {
  await signIn(page, "audio", { next: "/library/topic/e2e-caching" });
  const listen = page.getByRole("button", { name: /^Listen/ });
  await expect(listen).toBeVisible();
  await listen.click();
  if (!isPhone(page)) await page.getByRole("dialog").getByRole("button", { name: "Collapse player" }).click();
  await expect(page.getByRole("button", { name: /^Playing|^Paused/ })).toBeVisible();
  await page.getByRole("link", { name: "Today" }).first().click();
  await expect(page).toHaveURL("/today");
  const mini = page.getByTestId(/mini-player-/).filter({ visible: true });
  await expect(mini).toHaveCount(1);
  await expect(mini.getByText("Caching")).toBeVisible();
  // The one <audio> element lives in the layout, so leaving the lesson did not stop it.
  const playing = await page.evaluate(() => {
    const a = document.querySelector("audio");
    return a ? !a.paused : "no element";
  });
  expect(playing).toBe(true);
});

test("on desktop Listen opens Now playing with the transcript", async ({ page }) => {
  await signIn(page, "audio", { next: "/library/topic/e2e-caching" });
  await page.getByRole("button", { name: /^Listen/ }).click();
  await openPlayer(page);
  const sheet = page.getByRole("dialog");
  const transcript = sheet.getByRole("list", { name: "Transcript" });
  await expect(transcript.getByText("A cache keeps hot data close to the reader.")).toBeVisible();
  // The transcript scrolls in its own box, so the controls stay on screen.
  expect(await transcript.evaluate((el) => getComputedStyle(el).overflowY)).toBe("auto");
  await expect(sheet.getByRole("group", { name: "Sections" }).getByRole("button", { name: "Recap" })).toBeVisible();
  await sheet.getByRole("button", { name: "Collapse player" }).click();
  await expect(sheet).toBeHidden();
});

test("× stops the lesson and closes the player", async ({ page }) => {
  await signIn(page, "audio", { next: "/library/topic/e2e-caching" });
  await page.getByRole("button", { name: /^Listen/ }).click();
  if (!isPhone(page)) await page.getByRole("dialog").getByRole("button", { name: "Collapse player" }).click();
  await page.getByRole("button", { name: "Stop and close the player" }).filter({ visible: true }).click();
  await expect(page.getByTestId(/mini-player-/).filter({ visible: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.querySelector("audio")?.paused)).toBe(true);
});

test("a finished lesson says Completed, then the bottom bar goes", async ({ page }) => {
  await signIn(page, "audio", { next: "/library/topic/e2e-caching" });
  await page.getByRole("button", { name: /^Listen/ }).click();
  if (!isPhone(page)) await page.getByRole("dialog").getByRole("button", { name: "Collapse player" }).click();
  const mini = page.getByTestId(/mini-player-/).filter({ visible: true });
  await expect(mini).toHaveCount(1);
  // Jump to the last second of the 30 s file and let it end.
  await page.waitForFunction(() => (document.querySelector("audio")?.duration ?? 0) > 0);
  await page.evaluate(() => {
    const a = document.querySelector("audio")!;
    a.currentTime = a.duration - 0.5;
  });
  await expect(mini.getByText("Completed")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Completed/ })).toBeVisible();
  // It says so for five seconds, then the player closes.
  await expect(mini).toHaveCount(0, { timeout: 10_000 });
  await expect(page.getByRole("button", { name: /^Completed/ })).toBeVisible();
});

test("the mini-player sits above the tab bar", { tag: "@mobile" }, async ({ page }) => {
  test.skip(!isPhone(page), "the tab bar is phone-only");
  await signIn(page, "audio", { next: "/library/topic/e2e-caching" });
  await page.getByRole("button", { name: /^Listen/ }).click();
  const mini = page.getByTestId("mini-player-tabbar");
  await expect(mini).toBeVisible();
  // Phones keep reading the lesson: no sheet opens on Listen.
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const [m, tabs] = await Promise.all([mini.boundingBox(), page.getByRole("navigation", { name: "Main" }).last().boundingBox()]);
  expect(m!.y + m!.height).toBeLessThanOrEqual(tabs!.y + 1);
});
