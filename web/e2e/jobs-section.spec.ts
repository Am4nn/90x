import { AxeBuilder } from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import postgres from "postgres";
import { signIn } from "./helpers";

// The Scheduled jobs section of /admin/analytics, on runs this spec writes itself (relative to now, so
// no job reads as late) and deletes afterwards. Weekly reviews is never written here, so it shows the
// "never ran" state. job_runs has no API grant, so the rows go in over the database connection.

const url = process.env.DATABASE_URL ?? "";
const local = /@(127\.0\.0\.1|localhost)[:/]/.test(url);
test.skip(!local, "writes job_runs rows, so it runs only against the local database");

const LEETCODE_ERROR = "3 of 5 users failed: LeetCode said 429 Too Many Requests";
let ids: number[] = [];
const db = local ? postgres(url, { max: 1, prepare: false }) : null;

test.beforeAll(async () => {
  if (!db) return;
  const run = (job: string, status: string, minutesAgo: number, ms: number, result: object, error: string | null = null) =>
    db`insert into public.job_runs (job, status, started_at, finished_at, duration_ms, result, error)
       values (${job}, ${status}, now() - make_interval(mins => ${minutesAgo}), now() - make_interval(mins => ${minutesAgo}) + make_interval(secs => ${ms / 1000}),
               ${ms}, ${db.json(result as postgres.JSONValue)}, ${error})
       returning id`;
  const rows = [
    await run("hourly", "skipped", 62, 1200, { users: 41, due: 0, ok: {}, failed: {} }),
    await run("hourly", "ok", 2, 2900, { users: 41, due: 2, ok: { morning: 2 }, failed: {} }),
    await run(
      "leetcode-sync",
      "failed",
      3,
      8200,
      { users: 5, ok: 2, new: 1, failed: 3, skipped: 0, disabled: 0, errors: ["LeetCode said 429 Too Many Requests"] },
      LEETCODE_ERROR,
    ),
    await run("db-backup", "ok", 4, 112_000, { bytes: 3_248_112, key: "90x/90x-e2e.dump.gpg" }),
  ];
  ids = rows.flatMap((r) => r.map((x) => Number(x.id)));
});

test.afterAll(async () => {
  if (!db) return;
  if (ids.length) await db`delete from public.job_runs where id in ${db(ids)}`;
  await db.end();
});

const jobs = (page: Page) => page.getByRole("region", { name: "Scheduled jobs" });

async function openJobs(page: Page) {
  await signIn(page, "admin-jobs", { admin: true, next: "/admin/analytics" });
  await expect(page.getByRole("heading", { name: "Scheduled jobs", exact: true })).toBeVisible();
  return jobs(page);
}

async function expectAxeClean(page: Page) {
  const scan = await new AxeBuilder({ page }).include("#jobs").analyze();
  expect(scan.violations).toEqual([]);
}

test("an admin sees each job's last run, the never-ran state and a failure's raw result", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const section = await openJobs(page);

  await expect(section.getByText("41 readers checked, 2 due: 2 morning plans")).toBeVisible();
  await expect(section.getByText("Backup 3.1 MB encrypted and uploaded")).toBeVisible();
  await expect(section.getByText("No run recorded yet").first()).toBeVisible();
  await expect(section.getByText("never ran").first()).toBeVisible();
  await expect(section.getByText("First due Sun", { exact: false }).first()).toBeVisible();
  await expect(section.getByRole("img", { name: "Last 2 runs, oldest first: 1 ok, 0 failed, 1 skipped" })).toBeVisible();
  await expect(section.getByText(/LeetCode sync failed today \d\d:\d\d: 3 of 5 users failed/)).toBeVisible();

  // The failed row opens to its runs, with the error and the raw result.
  const leetcode = section.locator("details").filter({ hasText: "LeetCode sync" });
  await leetcode.locator("summary").click();
  const runs = section.getByRole("list", { name: "Last runs of LeetCode sync" });
  await expect(runs).toBeVisible();
  await expect(runs.getByText(LEETCODE_ERROR)).toBeVisible();
  await expect(runs.getByText('"errors":["LeetCode said 429 Too Many Requests"]', { exact: false })).toBeVisible();
  await expect(runs.getByText("8.2 s")).toBeVisible();

  await expectAxeClean(page);
  // A screenshot for visual review.
  await section.screenshot({ path: testInfo.outputPath("jobs-1280.png") });

  // The redesigned Analytics page is 1120 px wide (the mock's width): there the rows become the mock's
  // six-column table with a header line. Widen the page to that and check it still reads and scans clean.
  await page.addStyleTag({ content: "main { max-width: 1120px !important; }" });
  await expect(section.getByText("Last run: what it returned")).toBeVisible();
  await expectAxeClean(page);
  await section.screenshot({ path: testInfo.outputPath("jobs-1120-wide.png") });
});

test("the section fits a 390 px phone in one column", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const section = await openJobs(page);
  await section.scrollIntoViewIfNeeded();
  await expect(section.getByText("41 readers checked, 2 due: 2 morning plans")).toBeVisible();
  await expect(section.getByText("Next:").first()).toBeVisible();

  // No sideways scroll, and every status chip sits inside the card (a long "First due" line once pushed it out).
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const card = await section.locator(".rounded-xl").first().boundingBox();
  expect(card).not.toBeNull();
  const right = card!.x + card!.width;
  for (const chip of await section.getByText(/^(ok|failed|never ran)$/).all()) {
    const box = await chip.boundingBox();
    expect(box && box.x + box.width).toBeLessThanOrEqual(right);
  }

  await section.locator("details").filter({ hasText: "LeetCode sync" }).locator("summary").click();
  await expect(section.getByRole("list", { name: "Last runs of LeetCode sync" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  await expectAxeClean(page);
  await section.screenshot({ path: testInfo.outputPath("jobs-390.png") });
});
