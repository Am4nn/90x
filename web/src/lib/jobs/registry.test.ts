import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { nextRun } from "./cron";
import { BACKUP_CRON, JOBS, jobIdOfPath, QSTASH_SCHEDULES } from "./registry";

const workflow = (name: string) => readFileSync(new URL(`../../../../.github/workflows/${name}`, import.meta.url), "utf8");

describe("the job registry", () => {
  it("has a row for every QStash route, named like the route", () => {
    const ids = new Set(JOBS.map((j) => j.id));
    for (const s of QSTASH_SCHEDULES) expect(ids.has(jobIdOfPath(s.path) as never), s.path).toBe(true);
    expect(jobIdOfPath("/api/jobs/leetcode-sync")).toBe("leetcode-sync");
  });

  it("uses ids the job_runs check accepts", () => {
    for (const j of JOBS) expect(j.id).toMatch(/^[a-z0-9-]{1,40}$/);
  });

  it("holds the backup cron that db-backup.yml really runs", () => {
    const doc = parse(workflow("db-backup.yml")) as { on: { schedule: { cron: string }[] } };
    expect(doc.on.schedule.map((s) => s.cron)).toEqual([BACKUP_CRON]);
  });

  it("puts the stale sweep on the hourly tick at 00 UTC", () => {
    const sweep = JOBS.find((j) => j.id === "stale-sweep")!.schedule;
    expect(sweep).toEqual({ cron: "5 0 * * *" });
  });

  it("gives every cron job a readable next run", () => {
    for (const j of JOBS) if ("cron" in j.schedule) expect(nextRun(j.schedule.cron, new Date()).getTime()).toBeGreaterThan(Date.now());
  });
});
