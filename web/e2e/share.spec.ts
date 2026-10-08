import { writeFile } from "node:fs/promises";
import { AxeBuilder } from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { finishOne, gotoToday, missions, openMissions, signIn } from "./helpers";

const shareRow = (page: Page) => page.getByRole("region", { name: "Share your day" });

/** Sign in as a new user and finish every mission, so Today offers the share row. */
async function finishTheDay(page: Page) {
  await signIn(page, "share");
  await expect(missions(page)).toBeVisible();
  await expect(shareRow(page)).toHaveCount(0);
  const planned = await openMissions(page).count();
  expect(planned).toBeGreaterThan(0);
  for (let i = 0; i < planned; i++) {
    await gotoToday(page);
    await finishOne(page);
  }
  await gotoToday(page);
  await expect(shareRow(page)).toBeVisible();
}

type Shared = { files: { type: string }[]; url?: string; text?: string };
type Stubs = { shared: Shared[]; copied: string[] };
declare global {
  interface Window {
    e2eStubs: Stubs;
  }
}

/**
 * Installs a fake share sheet and clipboard before any page script runs, recording what the app
 * hands them. `share` is the fake sheet: absent, or one that resolves or rejects; `files` is
 * whether canShare accepts files.
 */
async function stubDevice(page: Page, device: { share: "absent" | "ok" | "abort"; files?: boolean }) {
  await page.addInitScript((d) => {
    const stubs: Stubs = { shared: [], copied: [] };
    window.e2eStubs = stubs;
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (text: string) => void stubs.copied.push(text) },
    });
    if (d.share === "absent") {
      Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
      Object.defineProperty(navigator, "canShare", { configurable: true, value: undefined });
      return;
    }
    Object.defineProperty(navigator, "canShare", { configurable: true, value: () => d.files === true });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data: { files?: File[]; url?: string; text?: string }) => {
        stubs.shared.push({ files: (data.files ?? []).map((f) => ({ type: f.type })), url: data.url, text: data.text });
        if (d.share === "abort") throw new DOMException("x", "AbortError");
      },
    });
  }, device);
}

const stubs = (page: Page) => page.evaluate(() => window.e2eStubs);
const inviteLink = async (page: Page) => ((await shareRow(page).getByTestId("share-link").textContent()) ?? "").trim();
const shareButton = (page: Page) => shareRow(page).getByRole("button", { name: "Share", exact: true });

test("the share row appears once the day is done, and the card it links is public", async ({ page, request }, testInfo) => {
  await finishTheDay(page);
  const share = shareRow(page);
  await expect(share.getByText("Share your Day 1")).toBeVisible();

  // The invite link is the landing page tagged for the existing signup-source capture.
  const link = share.getByTestId("share-link");
  await expect(link).toContainText("utm_source=share");
  const text = (await link.textContent()) ?? "";
  expect(text).toContain("utm_medium=invite");
  const code = /utm_campaign=([a-z0-9]{8})/.exec(text)?.[1];
  expect(code).toBeTruthy();

  // `request` carries no session: this is what a stranger gets.
  const png = await request.get(`/api/share/${code}`);
  expect(png.status()).toBe(200);
  expect(png.headers()["content-type"]).toContain("image/png");
  expect(png.headers()["cache-control"]).toContain("s-maxage=900");
  const bytes = await png.body();
  expect(bytes.subarray(1, 4).toString()).toBe("PNG");
  // The IHDR chunk follows the 8-byte signature and the chunk header: width, then height.
  expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([1200, 630]);
  // The sharer's own card carries the current version ("<day>-<finished days>": Day 1, one done), and only
  // that version renders: any other well-formed one is a short-cached 404, so `?v=` cannot force renders.
  const download = share.getByRole("link", { name: "download the card as a PNG" });
  await expect(download).toHaveAttribute("href", `/api/share/${code}?v=1-1`);
  expect((await request.get(`/api/share/${code}?v=1-1`)).status()).toBe(200);
  for (const v of ["0-0", "1-0", "2-1", "1-2", "100-73"]) {
    const stale = await request.get(`/api/share/${code}?v=${v}`);
    expect(stale.status(), v).toBe(404);
    expect(stale.headers()["cache-control"], v).toBe("public, max-age=60");
  }

  // Malformed, hostile, and well-formed but unknown ("qqqqqqqq" is not a code any user holds).
  const hostile = ["ABCDEFGH", "k7m2p9q", "k7m2p9qaa", "../x", "%2e%2e%2fx", "%3Cscript%3E", "%252e%252e", "%00%ff%25", "qqqqqqqq"];
  for (const bad of hostile) {
    expect((await request.get(`/api/share/${bad}`)).status(), bad).toBe(404);
  }
  for (const v of ["x", "1-", "1-2-3", "1234-1", "1-1000"]) {
    expect((await request.get(`/api/share/${code}?v=${v}`)).status(), v).toBe(404);
  }

  // Accessibility of the Today row, in its loaded state.
  const today = await new AxeBuilder({ page }).include('[aria-label="Share your day"]').analyze();
  expect(today.violations).toEqual([]);

  // The same code is reused, and Me offers the same row.
  await page.goto("/me");
  const meShare = shareRow(page);
  await expect(meShare).toBeVisible();
  await expect(meShare.getByTestId("share-link")).toContainText(`utm_campaign=${code}`);
  const me = await new AxeBuilder({ page }).include('[aria-label="Share your day"]').analyze();
  expect(me.violations).toEqual([]);

  // Screenshots: the row at phone width and at desktop width, and the card itself.
  const cardFile = testInfo.outputPath("share-card.png");
  await writeFile(cardFile, bytes);
  await testInfo.attach("share-card.png", { path: cardFile, contentType: "image/png" });
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/today");
    const row = shareRow(page);
    await expect(row.getByTestId("share-link")).toContainText("utm_source=share");
    const path = testInfo.outputPath(`share-row-${width}.png`);
    await row.screenshot({ path });
    await testInfo.attach(`share-row-${width}.png`, { path, contentType: "image/png" });
  }
});

test("Share hands the card and the invite link to the share sheet", async ({ page }) => {
  await stubDevice(page, { share: "ok", files: true });
  await finishTheDay(page);
  await expect(shareRow(page).getByTestId("share-link")).toContainText("utm_source=share");
  const link = await inviteLink(page);
  await shareButton(page).click();
  await expect.poll(async () => (await stubs(page)).shared.length).toBe(1);
  const [call] = (await stubs(page)).shared;
  if (!call) throw new Error("the share sheet was not called");
  expect(call.files.map((f) => f.type)).toEqual(["image/png"]);
  expect(`${call.url} ${call.text}`).toContain(link);
});

test("a device that cannot share files gets the link alone", async ({ page }) => {
  await stubDevice(page, { share: "ok", files: false });
  await finishTheDay(page);
  await expect(shareRow(page).getByTestId("share-link")).toContainText("utm_source=share");
  const link = await inviteLink(page);
  await shareButton(page).click();
  await expect.poll(async () => (await stubs(page)).shared.length).toBe(1);
  const [call] = (await stubs(page)).shared;
  if (!call) throw new Error("the share sheet was not called");
  expect(call.files).toEqual([]);
  expect(`${call.url} ${call.text}`).toContain(link);
});

test("a device with no share sheet copies the link and offers the PNG", async ({ page }) => {
  await stubDevice(page, { share: "absent" });
  await finishTheDay(page);
  await expect(shareRow(page).getByTestId("share-link")).toContainText("utm_source=share");
  const png = shareRow(page).getByRole("link", { name: "download the card as a PNG" });
  await expect(png).toBeVisible();
  const link = await inviteLink(page);
  await shareButton(page).click();
  await expect.poll(async () => (await stubs(page)).copied.length).toBe(1);
  expect((await stubs(page)).copied[0]).toContain(link);
  await expect(shareRow(page).getByText("Link copied.")).toBeVisible();
  // The note sits beside the footnote; the PNG link stays.
  await expect(png).toBeVisible();
});

test("a failed code request shows Try again, and trying again makes the link", async ({ page }) => {
  await stubDevice(page, { share: "absent" });
  await finishTheDay(page);
  // Fail the first share-code action after a reload; let everything else through.
  let failed = false;
  await page.route("**/*", (route) => {
    const req = route.request();
    if (!failed && req.method() === "POST" && req.headers()["next-action"]) {
      failed = true;
      return route.abort();
    }
    return route.continue();
  });
  await page.reload();
  const row = shareRow(page);
  const again = row.getByRole("button", { name: "Try again" });
  await expect(again).toBeVisible();
  await expect(row.getByRole("status")).toContainText("try again");
  await again.click();
  await expect(row.getByTestId("share-link")).toContainText("utm_source=share");
  await expect(again).toHaveCount(0);
});

test("closing the share sheet is not an error", async ({ page }) => {
  await stubDevice(page, { share: "abort", files: true });
  await finishTheDay(page);
  await shareButton(page).click();
  await expect.poll(async () => (await stubs(page)).shared.length).toBe(1);
  const row = shareRow(page);
  await expect(row.getByText("Link copied.")).toHaveCount(0);
  await expect(row.getByText(/could not|select the link/i)).toHaveCount(0);
  expect((await stubs(page)).copied).toEqual([]);
});
