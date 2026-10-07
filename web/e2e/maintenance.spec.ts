import { type APIRequestContext, expect, type Page, test } from "@playwright/test";
import { scan, signIn } from "./helpers";

// Maintenance mode, end to end. The switch is shared by the whole server, so every test turns it off
// again in afterEach and waits until a signed-out request gets the landing page back: nothing after this
// spec may start while the app is down. Each server instance re-reads the switch within ~10 s (the
// in-memory cache in lib/maintenance/flag.ts), hence the polls.

const HEADING = "90x is down for maintenance.";
const toggle = (page: Page) => page.getByRole("switch", { name: "Maintenance mode" });
const messageField = (page: Page) => page.getByLabel("Message on the maintenance page");
const messageBox = (page: Page) => page.locator("[data-maintenance=message]");
const banner = (page: Page) => page.getByRole("status").filter({ hasText: "Maintenance mode is on." });
const SETTLE = { timeout: 30_000 };
/** TTL_MS in lib/maintenance/flag.ts. */
const FLAG_TTL_MS = 10_000;

/** A signed-out request's status for the landing page: 503 while down, 200 while live. */
const landingStatus = async (request: APIRequestContext) => (await request.get("/", { maxRedirects: 0 })).status();

/** Signs a fresh admin in on Settings, sets the switch and the message, and waits until a signed-out visitor sees the result. */
async function setMaintenance(page: Page, request: APIRequestContext, on: boolean, message = "") {
  await signIn(page, "maint-admin", { admin: true, next: "/admin/settings" });
  await messageField(page).fill(message);
  const wasOn = (await toggle(page).getAttribute("aria-checked")) === "true";
  if (on && !wasOn) {
    await toggle(page).click();
    const confirm = page.getByRole("alertdialog", { name: "Turn on maintenance mode?" });
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "Turn on", exact: true }).click();
  } else if (!on && wasOn) {
    // Turning it off needs no confirm: the switch saves at once.
    await toggle(page).click();
  } else {
    await page.getByRole("button", { name: "Save message" }).click();
  }
  await expect(page.getByText("Saved.")).toBeVisible();
  const savedAt = Date.now();
  await expect(toggle(page)).toHaveAttribute("aria-checked", String(on));
  await expect.poll(() => landingStatus(request), SETTLE).toBe(on ? 503 : 200);
  await expect.poll(async () => (await (await request.get("/api/health")).json()).maintenance, SETTLE).toBe(on);
  // Off reaches every part of the server within one TTL of the save (lib/maintenance/flag.ts), the parts this
  // spec never touched included. Wait it out, so no later spec meets a stale "on".
  if (!on) await page.waitForTimeout(Math.max(0, savedAt + FLAG_TTL_MS + 1_000 - Date.now()));
}

test.afterEach(async ({ page, request }) => {
  await setMaintenance(page, request, false);
});

test(
  "a signed-out visitor gets the maintenance page with a 503, and APIs answer 503 JSON",
  { tag: "@mobile" },
  async ({ page, request }) => {
    await setMaintenance(page, request, true);
    await page.context().clearCookies();

    for (const path of ["/", "/try", "/today"]) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(503);
      expect(res?.headers()["retry-after"], path).toBe("300");
      await expect(page.getByRole("heading", { level: 1, name: HEADING })).toBeVisible();
    }
    await expect(page.getByText("Your progress is safe. We will be back soon.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Check again" })).toBeVisible();
    await expect(page.getByRole("link", { name: "support@mail.90x.amanarya.com" })).toBeVisible();
    // An empty message shows no box at all, and no stand-in text.
    await expect(messageBox(page)).toHaveCount(0);
    await scan(page, "the maintenance page");

    const api = await request.post("/api/coach/chat", { data: {} });
    expect(api.status()).toBe(503);
    expect(await api.json()).toEqual({ error: "maintenance" });
    // A server action is refused on any URL, an open one included.
    const action = await request.post("/privacy", { headers: { "next-action": "0123456789abcdef" }, data: "[]" });
    expect(action.status()).toBe(503);
    // Still reachable: the legal pages and the uptime check, which says the app is in maintenance.
    expect((await request.get("/privacy")).status()).toBe(200);
    await expect.poll(async () => (await (await request.get("/api/health")).json()).maintenance, SETTLE).toBe(true);
  },
);

test("the admin's message shows on the maintenance page", async ({ page, request }) => {
  await setMaintenance(page, request, true, "  Back by 6pm IST.  ");
  await page.context().clearCookies();
  // The page reads the message from its own server's copy of the switch.
  await expect(async () => {
    await page.goto("/");
    await expect(messageBox(page)).toHaveText("Back by 6pm IST.", { timeout: 1_000 });
  }).toPass(SETTLE);
  await expect(page.getByRole("heading", { level: 1, name: HEADING })).toBeVisible();
});

test("an admin keeps the app with a banner, and turning it off brings the app back for everyone", async ({ page, request }) => {
  await setMaintenance(page, request, true);

  const today = await page.goto("/today");
  expect(today?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: HEADING })).toHaveCount(0);
  await expect(async () => {
    await page.goto("/today");
    await expect(banner(page)).toBeVisible({ timeout: 1_000 });
  }).toPass(SETTLE);

  await banner(page).getByRole("link", { name: "Turn off" }).click();
  await expect(page).toHaveURL("/admin/settings");
  await expect(banner(page)).toBeVisible();
  await expect(toggle(page)).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText("App is in maintenance")).toBeVisible();
  await toggle(page).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await expect(page.getByText("App is live")).toBeVisible();

  await expect.poll(() => landingStatus(request), SETTLE).toBe(200);
  expect((await request.get("/api/coach/chat")).status()).not.toBe(503);
});

test("Cancel in the confirm leaves the app live", async ({ page, request }) => {
  await signIn(page, "maint-cancel", { admin: true, next: "/admin/settings" });
  await toggle(page).click();
  const confirm = page.getByRole("alertdialog", { name: "Turn on maintenance mode?" });
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(confirm).toBeHidden();
  await expect(toggle(page)).toHaveAttribute("aria-checked", "false");
  expect(await landingStatus(request)).toBe(200);
});

/** Writes the Redis copy the proxy obeys directly, behind the stored switch's back (as a lost or failed mirror would). */
async function setPublished(state: { on: boolean; message: string }) {
  const res = await fetch(process.env.UPSTASH_REDIS_REST_URL!, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(["SET", "90x:maintenance", JSON.stringify(state)]),
  });
  expect(res.ok).toBe(true);
}

test("saving the other settings never touches the switch", async ({ page, request }) => {
  await setMaintenance(page, request, true, "Back soon.");
  // A tab that loaded before the switch went on would show it off; the general form no longer carries it at all.
  await page.getByRole("button", { name: "Save settings" }).click();
  // One "Saved." from the switch, one from the general form.
  await expect(page.getByText("Saved.")).toHaveCount(2);
  await page.reload();
  await expect(toggle(page)).toHaveAttribute("aria-checked", "true");
  await expect(messageField(page)).toHaveValue("Back soon.");
  expect(await landingStatus(request)).toBe(503);
});

test("the card shows when the app disagrees with the saved switch, and Re-apply fixes it", async ({ page, request }) => {
  await setMaintenance(page, request, true);
  await setPublished({ on: false, message: "" });
  await page.reload();
  const warning = page.getByRole("alert").filter({ hasText: "Re-apply" });
  await expect(warning).toContainText("The app is live right now, but the switch is saved as in maintenance.");
  await warning.getByRole("button", { name: "Re-apply" }).click();
  // The warning, and with it the Re-apply form, goes once the app obeys the saved switch again.
  await expect(warning).toHaveCount(0);
  await expect.poll(() => landingStatus(request), SETTLE).toBe(503);
});
