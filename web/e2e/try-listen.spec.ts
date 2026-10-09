import { expect, type Page, test } from "@playwright/test";
import { TRY_LESSON } from "../src/lib/landing/try-cards";

// /try's demo player (components/try/demo-player.tsx). The public route /api/audio/demo is stubbed per test, so
// each answer (200, 404, 503, no network) is tested on purpose; the 200 points at the e2e tone, a local file.

const LINES = [
  { role: "narrator", text: "One", section: "intro", start_s: 0, end_s: 2 },
  { role: "narrator", text: "Two", section: "pitfalls", start_s: 2, end_s: 4 },
  { role: "narrator", text: "Three", section: "recap", start_s: 4, end_s: 6 },
];
const DEMO = {
  slug: TRY_LESSON.slug,
  url: "/e2e/tone.mp3",
  durationS: 6,
  lines: LINES,
};
const sectionAt = (i: number) => (i < 8 ? "intro" : i < 16 ? "pitfalls" : "recap");
const CANT_PLAY = "Can't play right now. The lesson is still here to read.";

type Answer = "ok" | "missing" | "down" | "offline";

/** Stubs the route; the returned object counts the requests. `answers` is used in order, the last one repeating. */
async function demoRoute(page: Page, answers: Answer[], delayMs = 0, demo: object = DEMO) {
  const calls = { count: 0 };
  await page.route("**/api/audio/demo", async (route) => {
    const answer = answers[Math.min(calls.count, answers.length - 1)];
    calls.count++;
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    if (answer === "ok") return route.fulfill({ json: demo });
    if (answer === "missing") return route.fulfill({ status: 404, json: { error: "no-audio" } });
    if (answer === "offline") return route.abort("internetdisconnected");
    return route.fulfill({ status: 503, json: { error: "unavailable" } });
  });
  return calls;
}

/** Keeps every media element the page plays, so a test can ask whether any is still playing once it left the DOM. */
async function watchMedia(page: Page) {
  await page.addInitScript(() => {
    const seen: HTMLMediaElement[] = [];
    (window as unknown as { seenMedia: HTMLMediaElement[] }).seenMedia = seen;
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      if (!seen.includes(this)) seen.push(this);
      return play.call(this);
    };
  });
}
const anyPlaying = (page: Page) =>
  page.evaluate(() => (window as unknown as { seenMedia: HTMLMediaElement[] }).seenMedia.some((m) => !m.paused));

const listenBar = (page: Page) => page.getByRole("button", { name: /^Listen, / });
// The lesson's own alert (Next.js keeps a route announcer with role="alert" in every page).
const cantPlay = (page: Page) => page.locator(`section[aria-labelledby="try-lesson-title"]`).getByRole("alert");
const player = (page: Page) => page.locator('[data-try="player"]');
const range = (page: Page) => player(page).getByRole("slider", { name: "Position" });
// The listen row under a card, once the lesson has started: a play/pause button and a button that opens Listen.
const mini = (page: Page) => page.locator('[data-try="mini"]');
const audioState = (page: Page) =>
  page.evaluate(() => {
    const a = document.querySelector("audio");
    return { count: document.querySelectorAll("audio").length, paused: a?.paused ?? true, at: a?.currentTime ?? -1 };
  });

async function openListen(page: Page) {
  await page.goto("/try");
  await page.getByRole("tab", { name: /Listen/ }).click();
  await expect(page.locator("#try-lesson-title")).toBeVisible();
}

test.describe("on a phone (390x844) @mobile", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });

  test("the Listen tab opens the lesson, and play fetches the route only then", async ({ page }) => {
    const calls = await demoRoute(page, ["ok"]);
    await openListen(page);
    await page.waitForTimeout(300);
    expect(calls.count).toBe(0);
    await expect(page.locator('[data-try="bar"]')).toHaveCount(0);
    await listenBar(page).click();
    await expect(player(page).getByRole("button", { name: "Pause", exact: true })).toBeVisible();
    const chips = player(page).getByRole("group", { name: "Sections" });
    for (const name of ["Intro", "Pitfalls", "Recap"]) await expect(chips.getByRole("button", { name, exact: true })).toBeVisible();
    await expect(page.locator('[data-try="bar"]')).toBeVisible(); // the first play shows the pinned bar
    await expect(player(page).getByRole("list", { name: "Transcript" }).getByRole("button")).toHaveCount(3);
    await expect(player(page).getByRole("button", { name: "Speed, 1x" })).toBeVisible();
    expect(calls.count).toBe(1);
    // A chip is 32px to see and 44px to tap.
    const chip = chips.getByRole("button", { name: "Intro" });
    expect((await chip.boundingBox())?.height).toBe(32);
    expect(await chip.evaluate((el) => el.getBoundingClientRect().height + 2 * -parseFloat(getComputedStyle(el, "::after").top))).toBe(44);
    // Pause pauses the audio.
    await player(page).getByRole("button", { name: "Pause", exact: true }).click();
    await expect(player(page).getByRole("button", { name: "Play", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.querySelector("audio")?.paused)).toBe(true);
    expect(calls.count).toBe(1);
  });

  test("play sends listen_start once, and a user pause sends listen_pause", async ({ page }) => {
    const kinds: string[] = [];
    await page.route("**/api/try/event", (route) => {
      kinds.push(JSON.parse(route.request().postData() ?? "{}").kind);
      return route.fulfill({ status: 204 });
    });
    await demoRoute(page, ["ok"]);
    await openListen(page);
    await listenBar(page).click();
    await expect.poll(() => kinds).toContain("listen_start");
    await player(page).getByRole("button", { name: "Pause", exact: true }).click();
    await player(page).getByRole("button", { name: "Play", exact: true }).click();
    await expect.poll(() => kinds).toContain("listen_pause");
    expect(kinds.filter((k) => k === "listen_start")).toHaveLength(1);
    // A tab round trip keeps the player as it was (it no longer remounts): still one start for the visit.
    await page.getByRole("tab").nth(0).click();
    await page.getByRole("tab", { name: /Listen/ }).click();
    await expect(player(page).getByRole("button", { name: "Pause", exact: true })).toBeVisible();
    await expect(listenBar(page)).toHaveCount(0);
    await page.waitForTimeout(300);
    expect(kinds.filter((k) => k === "listen_start")).toHaveLength(1);
  });

  test("a finished lesson: the listen row says Finished, and its Play starts over from 0", async ({ page }) => {
    const calls = await demoRoute(page, ["ok"]);
    await openListen(page);
    await listenBar(page).click();
    await player(page).getByRole("button", { name: "Forward 15 seconds" }).click();
    await expect.poll(async () => Number(await range(page).inputValue())).toBe(6);
    // The e2e tone runs past the lesson's 6 s, so it does not end by itself: paused at the end is heard to the end.
    await player(page).getByRole("button", { name: "Pause", exact: true }).click();
    await page.getByRole("tab").nth(0).click();
    await expect(mini(page).getByText("Finished · tap to open")).toBeVisible();
    await expect(mini(page)).toContainText("-0:00");
    await mini(page).getByRole("button", { name: "Play the lesson" }).click();
    await expect(mini(page).getByRole("button", { name: "Pause the lesson" })).toBeVisible();
    await expect(mini(page).getByText("Playing · tap to open")).toBeVisible();
    const now = await audioState(page);
    expect(now.paused).toBe(false);
    expect(now.at).toBeLessThan(3);
    expect(calls.count).toBe(1);
  });

  test("a first play cut short by a pause settles paused, and the next press plays", async ({ page }) => {
    await page.addInitScript(() => {
      const play = HTMLMediaElement.prototype.play;
      let first = true;
      HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
        if (first) {
          first = false;
          return Promise.reject(new DOMException("interrupted", "AbortError"));
        }
        return play.call(this);
      };
    });
    const kinds: string[] = [];
    await page.route("**/api/try/event", (route) => {
      kinds.push(JSON.parse(route.request().postData() ?? "{}").kind);
      return route.fulfill({ status: 204 });
    });
    await demoRoute(page, ["ok"]);
    await openListen(page);
    await listenBar(page).click();
    await expect(player(page).getByRole("button", { name: "Play", exact: true })).toBeVisible();
    await page.waitForTimeout(300);
    expect(kinds).not.toContain("listen_start"); // nothing has played yet
    await expect(page.locator('[data-try="bar"]')).toHaveCount(0);
    await player(page).getByRole("button", { name: "Play", exact: true }).click();
    await expect(player(page).getByRole("button", { name: "Pause", exact: true })).toBeVisible();
    await expect.poll(() => kinds).toContain("listen_start");
    await expect(page.locator('[data-try="bar"]')).toBeVisible();
  });

  test("a play() that starts and then rejects says it can't play, sends no listen_start and shows no bar", async ({ page }) => {
    // The e2e build plays a local tone whatever the route's URL, so the failure is made at play(): the element
    // fires `play` (as a real one does the moment play() is called), then the promise rejects.
    await page.addInitScript(() => {
      HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
        this.dispatchEvent(new Event("play"));
        return Promise.reject(new DOMException("no supported source", "NotSupportedError"));
      };
    });
    const kinds: string[] = [];
    await page.route("**/api/try/event", (route) => {
      kinds.push(JSON.parse(route.request().postData() ?? "{}").kind);
      return route.fulfill({ status: 204 });
    });
    await demoRoute(page, ["ok"], 0);
    await openListen(page);
    await listenBar(page).click();
    await expect(cantPlay(page)).toHaveText(CANT_PLAY);
    await page.waitForTimeout(300);
    expect(kinds).not.toContain("listen_start");
    await expect(page.locator('[data-try="bar"]')).toHaveCount(0);
  });

  test("hiding the tab mid-play sends one leave: bucketed time, step listened", async ({ page }) => {
    const events: { kind: string; data?: Record<string, unknown> }[] = [];
    await page.route("**/api/try/event", (route) => {
      events.push(JSON.parse(route.request().postData() ?? "{}"));
      return route.fulfill({ status: 204 });
    });
    await demoRoute(page, ["ok"]);
    await openListen(page);
    await listenBar(page).click();
    await expect(player(page).getByRole("button", { name: "Pause", exact: true })).toBeVisible();
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect.poll(() => events.find((e) => e.kind === "leave")?.data).toEqual({ seconds: "0-10", step: "listened" });
  });

  test("a second press while loading does nothing", async ({ page }) => {
    const calls = await demoRoute(page, ["ok"], 500);
    await openListen(page);
    await listenBar(page).click();
    await listenBar(page).click();
    await expect(player(page).getByRole("button", { name: "Pause", exact: true })).toBeVisible();
    expect(calls.count).toBe(1);
  });

  test("chips and transcript lines seek", async ({ page }) => {
    await demoRoute(page, ["ok"]);
    await openListen(page);
    await listenBar(page).click();
    await player(page).getByRole("group", { name: "Sections" }).getByRole("button", { name: "Recap" }).click();
    await expect.poll(async () => Number(await range(page).inputValue())).toBeGreaterThanOrEqual(4);
    await expect(player(page).getByRole("group", { name: "Sections" }).getByRole("button", { name: "Recap" })).toHaveAttribute(
      "aria-current",
      "true",
    );
    await player(page).getByRole("list", { name: "Transcript" }).getByRole("button", { name: "One" }).click();
    await expect.poll(async () => Number(await range(page).inputValue())).toBeLessThan(2);
    await player(page).getByRole("button", { name: "Forward 15 seconds" }).click();
    await player(page).getByRole("button", { name: "Back 15 seconds" }).click();
    await expect.poll(async () => Number(await range(page).inputValue())).toBeLessThan(2);
  });

  test("404 hides the audio, the lesson stays", async ({ page }) => {
    await demoRoute(page, ["missing"]);
    await openListen(page);
    await listenBar(page).click();
    await expect(page.getByText("Audio isn't available yet.")).toBeVisible();
    await expect(listenBar(page)).toHaveCount(0);
    await expect(page.getByText(TRY_LESSON.opening[0], { exact: false })).toBeVisible();
    await expect(page.locator('[data-try="bar"]')).toHaveCount(0); // nothing played
    // The cards no longer offer the lesson's audio.
    await page.getByRole("tab").nth(0).click();
    await expect(page.getByRole("button", { name: /the lesson, with audio/ })).toHaveCount(0);
    // Back on Listen it still says so, without asking again.
    await page.getByRole("tab", { name: /Listen/ }).click();
    await expect(page.getByText("Audio isn't available yet.")).toBeVisible();
    await expect(listenBar(page)).toHaveCount(0);
  });

  test("503 says it can't play; the bar stays and a second press asks once more", async ({ page }) => {
    const calls = await demoRoute(page, ["down"]);
    await openListen(page);
    await listenBar(page).click();
    await expect(cantPlay(page)).toHaveText(CANT_PLAY);
    await expect(listenBar(page)).toBeVisible();
    await page.waitForTimeout(500);
    expect(calls.count).toBe(1); // no automatic retry
    await listenBar(page).click();
    await expect.poll(() => calls.count).toBe(2);
    await expect(cantPlay(page)).toHaveText(CANT_PLAY);
  });

  test("no network says the same, and the next press can play", async ({ page }) => {
    const calls = await demoRoute(page, ["offline", "ok"]);
    await openListen(page);
    await listenBar(page).click();
    await expect(cantPlay(page)).toHaveText(CANT_PLAY);
    await listenBar(page).click();
    await expect(player(page).getByRole("button", { name: "Pause", exact: true })).toBeVisible();
    await expect(cantPlay(page)).toHaveCount(0);
    expect(calls.count).toBe(2);
  });

  test("a playback error mid-listen asks for the file once more and keeps playing; a second says it can't play", async ({ page }) => {
    const calls = await demoRoute(page, ["ok"]);
    await openListen(page);
    await listenBar(page).click();
    await expect(player(page).getByRole("button", { name: "Pause", exact: true })).toBeVisible();
    // An expired URL: the element's file stops loading.
    await page.evaluate(() => {
      const a = document.querySelector("audio");
      if (a) a.src = "/e2e/expired.mp3";
    });
    await expect.poll(() => calls.count).toBe(2);
    await expect.poll(() => page.evaluate(() => document.querySelector("audio")?.src ?? "")).toContain("/e2e/tone.mp3");
    await expect.poll(() => page.evaluate(() => document.querySelector("audio")?.paused)).toBe(false);
    await expect(player(page).getByRole("button", { name: "Pause", exact: true })).toBeVisible();
    // It happens again: the one fresh URL is spent.
    await page.evaluate(() => {
      const a = document.querySelector("audio");
      if (a) a.src = "/e2e/expired.mp3";
    });
    await expect(cantPlay(page)).toHaveText(CANT_PLAY);
    await expect(listenBar(page)).toBeVisible();
    expect(calls.count).toBe(2);
  });

  test("switching tabs keeps the lesson playing; the listen row is a live mini player", async ({ page }) => {
    await watchMedia(page);
    const events: { kind: string; data?: Record<string, unknown> }[] = [];
    await page.route("**/api/try/event", (route) => {
      events.push(JSON.parse(route.request().postData() ?? "{}"));
      return route.fulfill({ status: 204 });
    });
    // A long lesson, so the row shows minutes left; the tone itself is 6 s, and every step below is well inside it.
    const calls = await demoRoute(page, ["ok"], 0, { ...DEMO, durationS: 600 });
    await page.goto("/try");
    // Before any play the row is the plain way to the lesson.
    await expect(page.getByRole("button", { name: /the lesson, with audio/ })).toBeVisible();
    await expect(mini(page)).toHaveCount(0);
    const idleHeight = (await page.getByRole("button", { name: /the lesson, with audio/ }).boundingBox())?.height;
    await page.getByRole("tab", { name: /Listen/ }).click();
    await listenBar(page).click();
    await expect(player(page).getByRole("button", { name: "Pause", exact: true })).toBeVisible();
    expect((await audioState(page)).count).toBe(1);

    // Listen to DSA: the same element plays on, nothing is asked again.
    await page.getByRole("tab").nth(1).click();
    await expect(page.getByRole("tab").nth(1)).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#try-lesson-title")).toBeHidden();
    const t0 = await audioState(page);
    expect(t0.count).toBe(1);
    expect(t0.paused).toBe(false);
    await expect.poll(async () => (await audioState(page)).at).toBeGreaterThan(t0.at);
    expect(await anyPlaying(page)).toBe(true);
    expect(calls.count).toBe(1);
    await expect(page.getByRole("button", { name: /the lesson, with audio/ })).toHaveCount(0);
    await expect(mini(page).getByText("Playing · tap to open")).toBeVisible();
    await expect(mini(page)).toContainText(/-9:5\d/);
    // Going live does not change the row's height (nothing under it jumps).
    expect((await mini(page).boundingBox())?.height).toBe(idleHeight);
    // The open button's name starts with what it shows.
    await expect(mini(page).getByRole("button", { name: "How LLMs work, playing, open the lesson", exact: true })).toBeVisible();
    // Two buttons side by side, the play/pause one a 44px target.
    const toggle = mini(page).getByRole("button", { name: "Pause the lesson" });
    const box = await toggle.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
    expect(await mini(page).locator("button button").count()).toBe(0);

    // Its pause pauses the one element and counts as a user pause.
    await toggle.click();
    await expect(mini(page).getByRole("button", { name: "Play the lesson" })).toBeVisible();
    await expect(mini(page).getByText("Paused · tap to open")).toBeVisible();
    expect((await audioState(page)).paused).toBe(true);
    await expect.poll(() => events.filter((e) => e.kind === "listen_pause").map((e) => e.data)).toEqual([{ at: "0-10" }]);

    // Play again: the same element, from where it was.
    const paused = await audioState(page);
    await mini(page).getByRole("button", { name: "Play the lesson" }).click();
    await expect(mini(page).getByRole("button", { name: "Pause the lesson" })).toBeVisible();
    await expect.poll(async () => (await audioState(page)).at).toBeGreaterThan(paused.at);
    expect((await audioState(page)).paused).toBe(false);

    // The title opens Listen, the player where the audio is.
    await mini(page)
      .getByRole("button", { name: /open the lesson$/ })
      .click();
    await expect(page.getByRole("tab", { name: /Listen/ })).toHaveAttribute("aria-selected", "true");
    await expect(player(page).getByRole("button", { name: "Pause", exact: true })).toBeVisible();
    const back = await audioState(page);
    expect(back.count).toBe(1);
    expect(back.at).toBeGreaterThanOrEqual(paused.at);
    expect(Math.abs(Number(await range(page).inputValue()) - back.at)).toBeLessThanOrEqual(1.5);
    expect(calls.count).toBe(1);
    expect(events.filter((e) => e.kind === "listen_start")).toHaveLength(1);
    expect(events.filter((e) => e.kind === "listen_pause")).toHaveLength(1);
  });

  test("leaving the Listen tab while it is still asking: it plays when the answer comes, and the row shows it", async ({ page }) => {
    await watchMedia(page);
    const calls = await demoRoute(page, ["ok"], 800);
    await openListen(page);
    await listenBar(page).click();
    await page.getByRole("tab").nth(0).click();
    await expect.poll(() => calls.count).toBe(1);
    await expect(mini(page).getByRole("button", { name: "Pause the lesson" })).toBeVisible();
    expect(await anyPlaying(page)).toBe(true);
    await expect(page.locator("audio")).toHaveCount(1);
    expect(calls.count).toBe(1);
  });

  test("a playback failure while a card shows: the listen row goes back to its idle look", async ({ page }) => {
    // The first answer plays; the one fresh URL after a playback error is refused (503), so the player fails.
    const calls = await demoRoute(page, ["ok", "down"]);
    await openListen(page);
    await listenBar(page).click();
    await expect(player(page).getByRole("button", { name: "Pause", exact: true })).toBeVisible();
    await page.getByRole("tab").nth(1).click();
    await expect(mini(page).getByRole("button", { name: "Pause the lesson" })).toBeVisible();
    await page.evaluate(() => {
      const a = document.querySelector("audio");
      if (a) a.src = "/e2e/expired.mp3";
    });
    await expect.poll(() => calls.count).toBe(2);
    await expect(mini(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /the lesson, with audio/ })).toBeVisible();
    // Listen says why, with the bar to try again.
    await page.getByRole("tab", { name: /Listen/ }).click();
    await expect(cantPlay(page)).toHaveText(CANT_PLAY);
    await expect(listenBar(page)).toBeVisible();
  });

  test("back on Listen the transcript shows the current line, though the box was hidden while a card showed", async ({ page }) => {
    // Many short lines, so the list is taller than its box and the current line is far down it.
    const lines = Array.from({ length: 24 }, (_, i) => ({
      role: "narrator",
      text: `Line ${i + 1} of the lesson, long enough to take a couple of rows on a phone.`,
      section: sectionAt(i),
      start_s: i * 0.25,
      end_s: (i + 1) * 0.25,
    }));
    await demoRoute(page, ["ok"], 0, { ...DEMO, lines });
    await openListen(page);
    await listenBar(page).click();
    await player(page).getByRole("button", { name: "Pause", exact: true }).click(); // still, so the line stays put
    await player(page).getByRole("group", { name: "Sections" }).getByRole("button", { name: "Recap" }).click();
    const list = player(page).getByRole("list", { name: "Transcript" });
    await expect.poll(() => list.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    await page.getByRole("tab").nth(1).click();
    await expect(mini(page).getByText("Paused · tap to open")).toBeVisible();
    await page.getByRole("tab", { name: /Listen/ }).click();
    await expect(list).toBeVisible();
    const inView = () =>
      list.evaluate((el) => {
        const now = el.querySelector('[aria-current="true"]');
        if (!now) return false;
        const box = el.getBoundingClientRect();
        const line = now.getBoundingClientRect();
        return line.top >= box.top && line.bottom <= box.bottom;
      });
    await expect.poll(inView).toBe(true);
  });

  test("95% listened shows the nudge once", async ({ page }) => {
    await demoRoute(page, ["ok"]);
    await openListen(page);
    await listenBar(page).click();
    const nudge = player(page).getByText(`That was one of ${TRY_LESSON.count} lessons.`);
    await expect(nudge).toBeVisible({ timeout: 15_000 });
    await expect(player(page).getByText("Sign in and Day 1 picks what you need next.")).toBeVisible();
    await expect(player(page).locator('[data-cta="try"]')).toBeVisible();
    await expect(nudge).toHaveCount(1);
    // Back to the start and to the end again: still the one nudge.
    const chips = player(page).getByRole("group", { name: "Sections" });
    await chips.getByRole("button", { name: "Intro" }).click();
    await expect.poll(async () => Number(await range(page).inputValue())).toBeLessThan(2);
    await player(page).getByRole("button", { name: "Forward 15 seconds" }).click();
    await expect.poll(async () => Number(await range(page).inputValue())).toBe(6);
    await expect(nudge).toHaveCount(1);
    await expect(player(page).locator('[data-cta="try"]')).toHaveCount(1);
  });

  test("position and speed last the visit: crossing to a wide screen remounts the player, and its next press resumes there", async ({
    page,
  }) => {
    const calls = await demoRoute(page, ["ok"]);
    await openListen(page);
    await listenBar(page).click();
    await player(page).getByRole("button", { name: "Pause", exact: true }).click(); // still, so the 6 s tone cannot end mid-test
    await player(page).getByRole("button", { name: "Speed, 1x" }).click();
    await page.getByRole("button", { name: "1.5x" }).click();
    await expect(player(page).getByRole("button", { name: "Speed, 1.5x" })).toBeVisible();
    await player(page).getByRole("group", { name: "Sections" }).getByRole("button", { name: "Recap" }).click();
    await expect.poll(async () => Number(await range(page).inputValue())).toBeGreaterThanOrEqual(4);
    const saved = Number(await range(page).inputValue());
    expect(saved).toBeGreaterThanOrEqual(4);
    // A tab round trip keeps the same element, position and speed: nothing is asked again.
    await page.getByRole("tab").nth(0).click();
    await page.getByRole("tab", { name: /Listen/ }).click();
    await expect(player(page).getByRole("button", { name: "Speed, 1.5x" })).toBeVisible();
    expect(Number(await range(page).inputValue())).toBe(saved);
    expect(calls.count).toBe(1);
    await expect(page.locator("audio")).toHaveCount(1);
    // The md breakpoint moves the lesson to its column: a remount, so the element is released...
    await page.setViewportSize({ width: 1280, height: 820 });
    const aside = page.locator("aside");
    await expect(aside.getByRole("button", { name: /^Listen, / })).toBeVisible();
    await expect(page.locator("audio")).toHaveCount(0);
    // ...and the next press asks again and resumes at the visit's position and speed.
    await aside.getByRole("button", { name: /^Listen, / }).click();
    await expect(aside.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
    expect(calls.count).toBe(2);
    await expect(aside.getByRole("button", { name: "Speed, 1.5x" })).toBeVisible();
    expect(await page.evaluate(() => document.querySelector("audio")?.playbackRate)).toBe(1.5);
    await expect.poll(async () => Number(await aside.getByRole("slider", { name: "Position" }).inputValue())).toBeGreaterThanOrEqual(saved);
  });

  test("the transcript follows inside its own box, and the page stays put", async ({ page }) => {
    // Many short lines over the six seconds, so the list is taller than its box.
    const lines = Array.from({ length: 24 }, (_, i) => ({
      role: "narrator",
      text: `Line ${i + 1} of the lesson, long enough to take a couple of rows on a phone.`,
      section: sectionAt(i),
      start_s: i * 0.25,
      end_s: (i + 1) * 0.25,
    }));
    await demoRoute(page, ["ok"], 0, { ...DEMO, lines });
    await openListen(page);
    await listenBar(page).click();
    await player(page).getByRole("button", { name: "Pause", exact: true }).click(); // hold still while measuring
    const list = player(page).getByRole("list", { name: "Transcript" });
    const box = await list.evaluate((el) => ({
      scroll: el.scrollHeight,
      client: el.clientHeight,
    }));
    expect(box.scroll).toBeGreaterThan(box.client); // a bounded box that scrolls
    await range(page).scrollIntoViewIfNeeded();
    const before = await page.evaluate(() => window.scrollY);
    const chips = player(page).getByRole("group", { name: "Sections" });
    await chips.getByRole("button", { name: "Pitfalls" }).click();
    await chips.getByRole("button", { name: "Recap" }).click();
    await expect.poll(() => list.evaluate((el) => el.scrollTop)).toBeGreaterThan(0); // it followed, in its box
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => window.scrollY)).toBe(before);
  });

  test("the button follows the element: a pause from elsewhere reads Play; a quick play then pause is not an error", async ({ page }) => {
    await demoRoute(page, ["ok"]);
    await openListen(page);
    await listenBar(page).click();
    await expect(player(page).getByRole("button", { name: "Pause", exact: true })).toBeVisible();
    await page.evaluate(() => document.querySelector("audio")?.pause()); // a headset button, the lock screen
    await expect(player(page).getByRole("button", { name: "Play", exact: true })).toBeVisible();
    await page.evaluate(() => void document.querySelector("audio")?.play());
    await expect(player(page).getByRole("button", { name: "Pause", exact: true })).toBeVisible();
    // Pause, then Play and Pause again before the play can start. A local file is buffered, so Chrome would resolve
    // that play; a streamed one rejects it with AbortError, which this element now does too.
    const toggle = player(page).getByRole("button", { name: /^(Play|Pause)$/ });
    await toggle.click();
    await expect(player(page).getByRole("button", { name: "Play", exact: true })).toBeVisible();
    await page.evaluate(() => {
      const a = document.querySelector("audio");
      if (!a) return;
      const play = a.play.bind(a);
      a.play = () => {
        void play().catch(() => {});
        a.pause();
        return Promise.reject(new DOMException("The play() request was interrupted by a call to pause().", "AbortError"));
      };
    });
    await toggle.click();
    await page.waitForTimeout(500);
    await expect(cantPlay(page)).toHaveCount(0);
    await expect(player(page)).toBeVisible();
    await expect(player(page).getByRole("button", { name: "Play", exact: true })).toBeVisible();
  });
});

test("desktop: the lesson sits in its own column and the sign-in card appears after play", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 820 });
  await demoRoute(page, ["ok"]);
  await page.goto("/try");
  const aside = page.locator("aside");
  await expect(aside).toBeVisible();
  await expect(aside.locator("#try-lesson-title")).toBeVisible();
  await expect(aside.locator('[data-cta="try"]')).toHaveCount(0);
  await aside.getByRole("button", { name: /^Listen, / }).click();
  await expect(aside.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  await expect(aside.locator('[data-try="signin"] [data-cta="try"]')).toBeInViewport(); // above the fold at 1280x820 after a play
  await expect(page.locator("audio")).toHaveCount(1);
});
