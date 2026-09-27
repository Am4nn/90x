import { expect, test } from "@playwright/test";

test("sign-in carries a link preview, and the icons and iOS launch images are served", async ({ page, request }) => {
  await page.goto("/sign-in");
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /\/opengraph-image/);
  const launch = page.locator(
    'link[rel="apple-touch-startup-image"][media="(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)"]',
  );
  await expect(launch).toHaveAttribute("href", "/splash/splash-390x844@3x.png");

  for (const path of ["/icon.svg", "/manifest.webmanifest", "/splash/splash-390x844@3x.png"]) {
    expect((await request.get(path)).status(), path).toBe(200);
  }
});
