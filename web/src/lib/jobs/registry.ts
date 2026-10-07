// Every scheduled job 90x runs, in one list: the QStash schedules (created by scripts/schedule-jobs.ts),
// the two sub-jobs inside the hourly tick, and the nightly backup in GitHub Actions. The admin page draws
// one row per entry, and job_runs.job holds the `id`.

/** The QStash schedules. `bun run schedule:jobs` creates exactly these. */
export const QSTASH_SCHEDULES = [
  { id: "90x-leetcode-sync", path: "/api/jobs/leetcode-sync", cron: "0 */6 * * *" },
  // Minute 5 of every hour: each user's midnight rollover, morning plan and 8 pm reminder.
  { id: "90x-hourly", path: "/api/jobs/hourly", cron: "5 * * * *" },
] as const;

/** The job_runs name of a QStash route: the last part of its path ("/api/jobs/hourly" -> "hourly"). */
export const jobIdOfPath = (path: string) => path.slice(path.lastIndexOf("/") + 1);

const cronOf = (path: string) => QSTASH_SCHEDULES.find((s) => s.path === path)!.cron;
const HOURLY = cronOf("/api/jobs/hourly");

/** .github/workflows/db-backup.yml's schedule (a unit test holds the two together). */
export const BACKUP_CRON = "30 21 * * *";

/** When a job runs: a UTC cron line, or a reader's own clock (the weekly review, Sunday 6 pm local). */
type Schedule = { cron: string } | { readerClock: { weekday: number; hour: number } };

export type JobDef = {
  id: "hourly" | "stale-sweep" | "weekly-reviews" | "leetcode-sync" | "db-backup";
  name: string;
  /** Where it is defined and how often, in plain words (times in IST). */
  where: string;
  schedule: Schedule;
  /** How long after a due time a missing run counts as late. Null: never flagged (reader-clock jobs). */
  graceMinutes: number | null;
};

export const JOBS: readonly JobDef[] = [
  {
    id: "hourly",
    name: "Hourly tick",
    where: "QStash 90x-hourly · every hour at :35",
    schedule: { cron: HOURLY },
    graceMinutes: 10,
  },
  {
    id: "stale-sweep",
    name: "Stale-card sweep",
    where: "inside the hourly tick · daily 05:35",
    // The tick at 00 UTC runs it (`getUTCHours() === 0` in the hourly route).
    schedule: { cron: `${HOURLY.split(" ")[0]} 0 * * *` },
    graceMinutes: 10,
  },
  {
    id: "weekly-reviews",
    name: "Weekly reviews",
    where: "inside the hourly tick · Sundays 6 pm, reader time",
    schedule: { readerClock: { weekday: 0, hour: 18 } },
    graceMinutes: null,
  },
  {
    id: "leetcode-sync",
    name: "LeetCode sync",
    where: "QStash 90x-leetcode-sync · every 6 h",
    schedule: { cron: cronOf("/api/jobs/leetcode-sync") },
    graceMinutes: 10,
  },
  {
    id: "db-backup",
    name: "Database backup",
    where: "GitHub Actions db-backup.yml · daily 03:00",
    schedule: { cron: BACKUP_CRON },
    // Scheduled Actions can start an hour or more late at peak times, and the row is written when the run ends.
    graceMinutes: 120,
  },
];
