import "server-only";
import { and, eq, lt } from "drizzle-orm";
import { db } from "@/db";
import { jobRuns } from "@/db/schema";
import { type Judge, recordRun, type RunStore } from "./record";

// job_runs over the server connection. The table has no API grant, so nothing else can write it.

const RETENTION_DAYS = 90;

export const jobRunStore: RunStore = {
  async start(job, startedAt) {
    const [row] = await db
      .insert(jobRuns)
      .values({ job, startedAt: startedAt.toISOString(), status: "running" })
      .returning({ id: jobRuns.id });
    if (!row) throw new Error("job_runs insert returned no row");
    return row.id;
  },
  async finish({ id, job, startedAt, finishedAt, status, durationMs, result, error }) {
    const end = { finishedAt: finishedAt.toISOString(), status, durationMs, result, error };
    if (id !== null) {
      await db.update(jobRuns).set(end).where(eq(jobRuns.id, id));
      return;
    }
    // The start write threw. Its insert may still have committed (a reply lost on the pooler, a timeout
    // after commit), so finish that `running` row if it is there; insert a whole row only if it is not.
    // Without this the orphan would read as a failed run 15 minutes later.
    const at = startedAt.toISOString();
    const finished = await db
      .update(jobRuns)
      .set(end)
      .where(and(eq(jobRuns.job, job), eq(jobRuns.startedAt, at), eq(jobRuns.status, "running")))
      .returning({ id: jobRuns.id });
    if (!finished.length) await db.insert(jobRuns).values({ job, startedAt: at, ...end });
  },
};

/** Runs a job and records the run in job_runs. Recording never makes the job fail. */
export const recordJob = <T>(job: string, run: () => Promise<T>, judge?: Judge<T>) => recordRun(job, run, { store: jobRunStore, judge });

/** Deletes runs older than 90 days. The hourly tick calls it, so the table stays about 2,700 rows. */
export async function pruneJobRuns(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 86_400_000).toISOString();
  const gone = await db.delete(jobRuns).where(lt(jobRuns.startedAt, cutoff)).returning({ id: jobRuns.id });
  return gone.length;
}
