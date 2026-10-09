import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

// Downloads need the service worker, which registers in the production build the e2e job runs. The download
// saves web/public/e2e/tone.mp3 (NEXT_PUBLIC_E2E_AUDIO_SRC, see ci.yml) instead of a signed bucket URL.
test("a downloaded lesson is listed in Settings and can be deleted", async ({ page }) => {
  await signIn(page, "offline", { next: "/library/topic/e2e-caching" });
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null);
  await page.getByRole("button", { name: /^Listen/ }).click();
  await page
    .getByRole("button", { name: /^Open player, Caching/ })
    .filter({ visible: true })
    .click();
  await page.getByRole("button", { name: "Download for offline" }).click();
  await page.getByRole("button", { name: "Download", exact: true }).click();
  await expect(page.getByRole("button", { name: "Downloaded. Remove download" })).toBeVisible();
  await page.goto("/me/settings");
  const row = page.getByRole("listitem").filter({ hasText: "Caching" });
  await expect(row).toContainText("MB");
  await expect(page.getByText("1 lesson on this device")).toBeVisible();
  await row.getByRole("button", { name: "Delete Caching download" }).click();
  await expect(page.getByText("No downloads yet", { exact: false })).toBeVisible();
});
