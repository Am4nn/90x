import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

const SUPPORT = "125aryaaman@gmail.com";

test("the legal pages render for a signed-out visitor, with the contact address", async ({ page }) => {
  for (const [path, heading] of [
    ["/privacy", "Privacy Policy"],
    ["/terms", "Terms of Service"],
    ["/delete-account", "Delete my account"],
  ] as const) {
    await page.goto(path);
    await expect(page).toHaveURL(path);
    await expect(page.getByRole("heading", { name: heading, exact: true, level: 1 })).toBeVisible();
    await expect(page.getByText("Last updated 5 October 2026")).toBeVisible();
    await expect(page.getByRole("link", { name: SUPPORT }).first()).toBeVisible();
  }
});

test("the landing page links to the legal pages and shows where to report a problem", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const footer = page.getByRole("contentinfo");
  await expect(footer.getByRole("link", { name: "Privacy", exact: true })).toHaveAttribute("href", "/privacy");
  await expect(footer.getByRole("link", { name: "Terms", exact: true })).toHaveAttribute("href", "/terms");
  await expect(footer.getByRole("link", { name: "Delete account", exact: true })).toHaveAttribute("href", "/delete-account");
  // Signed out: the address is text to select, not a form.
  await expect(footer.getByText(SUPPORT)).toBeVisible();
  await expect(page.locator('[data-landing="consent"]').first()).toContainText("By continuing you agree to the Terms and Privacy Policy");

  await footer.getByRole("link", { name: "Privacy", exact: true }).click();
  await expect(page).toHaveURL("/privacy");
  // No sideways scroll on a phone.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("Settings links to the legal pages and to Report a problem", async ({ page }) => {
  await signIn(page, "trust-links", { next: "/me/settings" });
  await expect(page.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy");
  await expect(page.getByRole("link", { name: "Terms of Service" })).toHaveAttribute("href", "/terms");
  await page.getByRole("link", { name: "Report a problem" }).click();
  await expect(page).toHaveURL(/\/me\/report/);
});

test("a report is sent, thanked, and shows up for the admin, who resolves it", async ({ page }) => {
  await signIn(page, "reporter", { next: "/me/settings" });
  await page.getByRole("link", { name: "Report a problem" }).click();
  const message = `Card froze ${randomUUID().slice(0, 8)}`;
  await page.getByLabel("What happened?").fill(message);
  await page.getByRole("button", { name: "Send report" }).click();
  await expect(page.getByText("Thank you.")).toBeVisible();

  await signIn(page, "report-admin", { admin: true, next: "/admin/reports" });
  const report = page.getByRole("article").filter({ hasText: message });
  await expect(report).toBeVisible();
  await expect(report).toContainText("/me/settings");
  await report.getByRole("button", { name: "Mark resolved" }).click();
  await expect(report.getByRole("button", { name: "Reopen" })).toBeVisible();
});

test("an empty report is refused with a message", async ({ page }) => {
  await signIn(page, "empty-report", { next: "/me/report" });
  // The browser blocks an empty required field, so send whitespace, which only the server trims away.
  await page.getByLabel("What happened?").fill("   ");
  await page.getByRole("button", { name: "Send report" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Tell us what happened." })).toBeVisible();
});

test("deleting the account asks for DELETE, then removes it and signs the person out", async ({ page }) => {
  await signIn(page, "leaver", { next: "/me/settings" });
  await page.getByRole("button", { name: "Delete my account…" }).click();
  // In the page, not a browser dialog, and the button waits for the word.
  const confirm = page.getByRole("button", { name: "Delete everything" });
  await expect(confirm).toBeDisabled();
  await page.getByLabel("Type DELETE to confirm").fill("DELETE");
  await expect(confirm).toBeEnabled();
  await confirm.click();

  await expect(page).toHaveURL("/?deleted=1");
  await expect(page.getByText("Your account and data were deleted.")).toBeVisible();

  // Signed out for real: the app sends a visitor on to the front page.
  await page.goto("/me/settings");
  await expect(page).toHaveURL("/");
});

test("installed on an iPhone, the public pages start below the status bar", { tag: "@mobile" }, async ({ page, browserName, isMobile }) => {
  test.skip(!isMobile, "the status bar inset only exists on a phone");
  test.skip(browserName !== "chromium", "the inset is emulated through Chrome's DevTools protocol");
  // A home-screen app runs under a translucent status bar: env(safe-area-inset-top) is its height.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setSafeAreaInsetsOverride" as never, { insets: { top: 59, bottom: 34 } } as never);
  for (const path of ["/privacy", "/terms", "/delete-account", "/no-such-page"]) {
    await page.goto(path);
    const first = page.locator("main").first().locator(":scope > *").first();
    await expect(first).toBeVisible();
    const box = await first.boundingBox();
    expect(box?.y ?? 0, path).toBeGreaterThanOrEqual(59);
  }
});
