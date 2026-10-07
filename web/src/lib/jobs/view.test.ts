import { describe, expect, it, vi } from "vitest";
import { JOBS, type JobDef } from "./registry";
import {
  buildOverview,
  formatDuration,
  formatWhen,
  isLate,
  jobsCaption,
  jobView,
  nextOf,
  STRIP_SIZE,
  type StoredRun,
  UNREADABLE_CAPTION,
} from "./view";

const job = (id: JobDef["id"]) => JOBS.find((j) => j.id === id)!;
// Thu 8 Oct 2026, 15:00 IST.
const NOW = new Date("2026-10-08T09:30:00Z");
const ago = (min: number) => new Date(NOW.getTime() - min * 60_000).toISOString();

let nextId = 1;
const run = (over: Partial<StoredRun> = {}): StoredRun => ({
  id: nextId++,
  job: "hourly",
  startedAt: ago(25),
  finishedAt: ago(25),
  status: "ok",
  durationMs: 2900,
  result: { users: 41, due: 2, ok: { morning: 2 }, failed: {} },
  error: null,
  ...over,
});

describe("formatting", () => {
  it("writes times in IST relative to today", () => {
    expect(formatWhen(new Date("2026-10-08T09:05:00Z"), NOW)).toBe("Today 14:35");
    expect(formatWhen(new Date("2026-10-08T21:30:00Z"), NOW)).toBe("Tomorrow 03:00");
    expect(formatWhen(new Date("2026-10-07T00:05:00Z"), NOW)).toBe("Yesterday 05:35");
    expect(formatWhen(new Date("2026-10-04T12:35:00Z"), NOW)).toBe("Sun 4 Oct 18:05");
  });

  it("writes durations the way the mock does", () => {
    expect(formatDuration(400)).toBe("0.4 s");
    expect(formatDuration(2900)).toBe("2.9 s");
    expect(formatDuration(41_000)).toBe("41 s");
    expect(formatDuration(112_000)).toBe("1 m 52 s");
    expect(formatDuration(null)).toBe("");
  });
});

describe("next run", () => {
  it("comes from the cron line, shown in IST", () => {
    expect(nextOf(job("hourly"), NOW).label).toBe("Today 15:35");
    expect(nextOf(job("leetcode-sync"), NOW).label).toBe("Today 17:30");
    expect(nextOf(job("stale-sweep"), NOW).label).toBe("Tomorrow 05:35");
    expect(nextOf(job("db-backup"), NOW).label).toBe("Tomorrow 03:00");
  });

  it("is the coming Sunday for the weekly reviews, on the reader's clock", () => {
    expect(nextOf(job("weekly-reviews"), NOW)).toMatchObject({ label: "Sun 11 Oct", detail: "6 pm, reader time" });
    expect(nextOf(job("weekly-reviews"), new Date("2026-10-11T05:00:00Z")).label).toBe("Today");
  });
});

describe("late", () => {
  it("flags a job whose due run is missing past its grace", () => {
    // Due 14:35 IST (09:05Z), 10 minutes' grace: at 15:00 IST a run from 13:35 is late.
    expect(isLate(job("hourly"), run({ startedAt: "2026-10-08T08:05:10Z" }), NOW)).toBe(true);
    expect(isLate(job("hourly"), run({ startedAt: "2026-10-08T09:05:10Z" }), NOW)).toBe(false);
    // Inside the grace the last hour's run still counts.
    expect(isLate(job("hourly"), run({ startedAt: "2026-10-08T08:05:10Z" }), new Date("2026-10-08T09:10:00Z"))).toBe(false);
  });

  it("never flags a job that has not run, or a reader-clock job", () => {
    expect(isLate(job("hourly"), undefined, NOW)).toBe(false);
    expect(isLate(job("weekly-reviews"), run({ startedAt: "2026-01-01T00:00:00Z" }), NOW)).toBe(false);
  });
});

describe("jobView", () => {
  it("shows the never-ran state", () => {
    const v = jobView(job("weekly-reviews"), [], NOW);
    expect(v).toMatchObject({ state: "never", summary: "No run recorded yet", last: "Never", runs: [] });
    expect(v.next.label).toBe("First due Sun 11 Oct");
    expect(v.strip).toEqual(Array(STRIP_SIZE).fill("none"));
  });

  it("summarises the last run and lays the strip out oldest first", () => {
    const runs = [run(), run({ status: "failed", error: "boom", result: {} }), run({ status: "skipped" })];
    const v = jobView(job("hourly"), runs, NOW);
    expect(v.state).toBe("ok");
    expect(v.summary).toBe("41 readers checked, 2 due: 2 morning plans");
    expect(v.last).toBe("Today 14:35 · took 2.9 s");
    expect(v.strip.slice(-3)).toEqual(["skipped", "failed", "ok"]);
    expect(v.strip).toHaveLength(STRIP_SIZE);
    expect(v.runs[1]).toMatchObject({ state: "failed", error: "boom", raw: "{}" });
  });

  it("keeps the strip to the last 14 runs", () => {
    const runs = Array.from({ length: 20 }, () => run());
    expect(jobView(job("hourly"), runs, NOW).strip).toHaveLength(STRIP_SIZE);
    expect(jobView(job("hourly"), runs, NOW).runs).toHaveLength(5);
  });

  it("calls a run stuck in running for 15 minutes failed", () => {
    const v = jobView(job("hourly"), [run({ status: "running", startedAt: ago(20), durationMs: null, result: {} })], NOW);
    expect(v.state).toBe("failed");
    expect(v.summary).toBe("No finish recorded: the run was stopped (time limit or crash)");
    const fresh = jobView(job("hourly"), [run({ status: "running", startedAt: ago(1), durationMs: null, result: {} })], NOW);
    expect(fresh).toMatchObject({ state: "running", summary: "Running now", last: "Today 14:59" });
  });
});

const view = (id: JobDef["id"], runs: StoredRun[]) => jobView(job(id), runs, NOW);

describe("jobsCaption", () => {
  it("says so when nothing has run at all", () => {
    expect(jobsCaption(JOBS.map((j) => jobView(j, [], NOW)))).toMatch(/^No job has recorded a run yet\. .*bun run schedule:jobs/);
  });

  it("says every job ran, or names the ones still waiting for a first run", () => {
    expect(jobsCaption([view("hourly", [run()])])).toBe("Every job ran when it was due.");
    expect(jobsCaption([view("hourly", [run()]), view("weekly-reviews", [])])).toBe("Nothing has failed. Weekly reviews has not run yet.");
  });

  it("explains a failure and when it runs again, and a late job", () => {
    const failed = view("leetcode-sync", [
      run({
        job: "leetcode-sync",
        startedAt: "2026-10-08T06:00:05Z",
        status: "failed",
        result: { users: 5, ok: 2, new: 0, failed: 3, skipped: 0, disabled: 0, errors: ["429"] },
        error: "3 of 5 users failed: 429",
      }),
    ]);
    const late = view("hourly", [run({ startedAt: "2026-10-08T07:05:00Z" })]);
    expect(jobsCaption([failed, late])).toBe(
      "LeetCode sync failed today 11:30: 3 of 5 users failed: 429. It runs again today 17:30. Hourly tick is late: no run recorded since today 12:35.",
    );
  });
});

describe("buildOverview", () => {
  it("lays the runs over every registry job, newest first per job", async () => {
    const o = await buildOverview(async () => [run({ job: "hourly" }), run({ job: "db-backup", result: { bytes: 3_248_112 } })], NOW);
    expect(o.rows.map((r) => r.id)).toEqual(JOBS.map((j) => j.id));
    expect(o.rows.find((r) => r.id === "db-backup")?.summary).toBe("Backup 3.1 MB encrypted and uploaded");
    expect(o.rows.find((r) => r.id === "weekly-reviews")?.state).toBe("never");
  });

  it("fails soft when job_runs cannot be read: every job never ran, the caption says why, the error is logged", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const o = await buildOverview(() => Promise.reject(new Error('relation "public.job_runs" does not exist')), NOW);
    expect(o.rows).toHaveLength(JOBS.length);
    expect(o.rows.every((r) => r.state === "never")).toBe(true);
    expect(o.caption).toBe(UNREADABLE_CAPTION);
    expect(log).toHaveBeenCalledOnce();
    log.mockRestore();
  });
});
