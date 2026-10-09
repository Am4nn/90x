import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

// Audio lessons. The e2e build sets NEXT_PUBLIC_E2E_AUDIO_SRC=/e2e/tone.mp3 (ci.yml), so the player plays a
// 30 s local file instead of asking R2 for a signed URL; the four AUDIO_R2_* variables are set to "e2e" so the
// listen bar shows. Everything else is real: the seeded lesson_audio row (scripts/seed-e2e.ts), the bar, the
// provider in the (app) layout and the mini-player.

test("Listen keeps playing across navigation and the mini-player shows", async ({ page }) => {
  await signIn(page, "audio", { next: "/library/topic/e2e-caching" });
  const listen = page.getByRole("button", { name: /^Listen/ });
  await expect(listen).toBeVisible();
  await listen.click();
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

test("the full player opens from the mini-player with the transcript", async ({ page }) => {
  await signIn(page, "audio", { next: "/library/topic/e2e-caching" });
  await page.getByRole("button", { name: /^Listen/ }).click();
  await page
    .getByRole("button", { name: /^Open player, Caching/ })
    .filter({ visible: true })
    .click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText("Now playing")).toBeVisible();
  await expect(sheet.getByRole("list", { name: "Transcript" }).getByText("A cache keeps hot data close to the reader.")).toBeVisible();
  await expect(sheet.getByRole("group", { name: "Sections" }).getByRole("button", { name: "Recap" })).toBeVisible();
  await sheet.getByRole("button", { name: "Collapse player" }).click();
  await expect(sheet).toBeHidden();
});

test("the mini-player sits above the tab bar", { tag: "@mobile" }, async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) >= 768, "the tab bar is phone-only");
  await signIn(page, "audio", { next: "/library/topic/e2e-caching" });
  await page.getByRole("button", { name: /^Listen/ }).click();
  const mini = page.getByTestId("mini-player-tabbar");
  await expect(mini).toBeVisible();
  const [m, tabs] = await Promise.all([mini.boundingBox(), page.getByRole("navigation", { name: "Main" }).last().boundingBox()]);
  expect(m!.y + m!.height).toBeLessThanOrEqual(tabs!.y + 1);
});
