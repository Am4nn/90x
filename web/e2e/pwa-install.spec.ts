import { expect, test } from "@playwright/test";
import { gotoToday, signIn } from "./helpers";

// The "install the app" prompts: how-to on iPhone Safari, the native prompt on Chromium,
// nothing once installed, and a dismissed banner stays away.

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1";

test.describe("iPhone Safari, not installed", () => {
  test.use({ userAgent: IPHONE_SAFARI });

  test("Today shows the Add to Home Screen how-to, and a dismissal lasts", async ({ page }) => {
    await signIn(page, "pwa-ios");
    await gotoToday(page);
    const banner = page.getByTestId("install-banner");
    await expect(banner).toBeVisible();
    await expect(banner.getByText("Add to Home Screen", { exact: false }).first()).toBeVisible();
    await expect(banner.getByText(/only work in the installed app/)).toBeVisible();

    await banner.getByRole("button", { name: "Dismiss" }).click();
    await expect(banner).toBeHidden();
    await gotoToday(page);
    await expect(page.getByTestId("install-banner")).toBeHidden();

    // Settings keeps the entry: it is the place to look when you want it later.
    await page.goto("/me/settings");
    await expect(page.getByTestId("install-row")).toBeVisible();
  });
});

test.describe("iPhone Safari, installed", () => {
  test.use({ userAgent: IPHONE_SAFARI });

  test("nothing is offered inside the Home Screen app", async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(navigator, "standalone", { value: true }));
    await signIn(page, "pwa-installed");
    await gotoToday(page);
    await expect(page.getByTestId("install-banner")).toBeHidden();
    await page.goto("/me/settings");
    await expect(page.getByTestId("install-row")).toBeHidden();
  });
});

test.describe("iPhone Chrome", () => {
  test.use({ userAgent: IPHONE_CHROME });

  test("gets no Safari how-to", async ({ page }) => {
    await signIn(page, "pwa-ios-chrome");
    await gotoToday(page);
    await expect(page.getByTestId("install-banner")).toBeHidden();
  });
});

test("Chromium: the install button appears once the browser offers the prompt", async ({ page }) => {
  await signIn(page, "pwa-chromium");
  await gotoToday(page);
  const banner = page.getByTestId("install-banner");
  await expect(banner).toBeHidden();
  // The browser fires this itself; retried because the listener attaches just after hydration.
  await expect(async () => {
    await page.evaluate(() => {
      const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
        prompt: () => Promise.resolve(),
        userChoice: Promise.resolve({ outcome: "dismissed" }),
      });
      window.dispatchEvent(event);
    });
    await expect(banner.getByRole("button", { name: "Install app" })).toBeVisible({ timeout: 500 });
  }).toPass();
});
