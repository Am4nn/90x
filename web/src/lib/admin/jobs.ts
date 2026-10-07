import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { buildOverview, STRIP_SIZE, type StoredRun } from "@/lib/jobs/view";

// The Scheduled jobs section of /admin/analytics: the last 14 runs of every job in one query, laid over
// the job registry so a job that never ran still gets its row. Not cached: it is one indexed read of a
// table that holds about 30 rows a day, and a stale "last run" is the one thing this section must not show.
// The caller has already checked the viewer is an admin.

/** The newest `STRIP_SIZE` runs per job, newest first. */
async function recentRuns(): Promise<StoredRun[]> {
  const rows = await db.execute<{
    id: string | number;
    job: string;
    started_at: string;
    finished_at: string | null;
    status: string;
    duration_ms: number | null;
    result: unknown;
    error: string | null;
  }>(sql`
    select id, job, started_at, finished_at, status, duration_ms, result, error
    from (
      select r.*, row_number() over (partition by job order by started_at desc, id desc) as n
      from public.job_runs r
    ) ranked
    where n <= ${STRIP_SIZE}
    order by job, started_at desc, id desc`);
  return rows.map((r) => ({
    id: Number(r.id),
    job: r.job,
    startedAt: new Date(r.started_at).toISOString(),
    finishedAt: r.finished_at ? new Date(r.finished_at).toISOString() : null,
    status: r.status,
    durationMs: r.duration_ms,
    result: r.result,
    error: r.error,
  }));
}

/** The section's rows and caption. A failed read (say, before the migration reaches the database) shows
 *  every job as never ran with a caption saying so, rather than breaking the whole Analytics page. */
export const jobsOverview = (now = new Date()) => buildOverview(recentRuns, now);
