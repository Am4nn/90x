// Runs the job_runs writes and the Scheduled jobs query against the migrated schema, so a renamed column
// fails here and not in a scheduled job at 3 am. It records real runs through the same store the QStash
// routes use, checks retention and the per-job "last 14 runs" query, then deletes every row it wrote.
// Run with `bun run check:jobs`.

import { inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { jobRuns } from "@/db/schema";
import { jobsOverview } from "@/lib/admin/jobs";
import { judgeLeetcode } from "@/lib/jobs/outcomes";
import { jobRunStore, pruneJobRuns, recordJob } from "@/lib/jobs/store";
import { STRIP_SIZE } from "@/lib/jobs/view";

// It writes and deletes job_runs rows: never let it near a real database.
for (const url of [process.env.DATABASE_URL, process.env.DIRECT_URL]) {
  if (!url || !/@(127\.0\.0\.1|localhost)[:/]/.test(url)) {
    console.error("check-jobs runs only against a local database (127.0.0.1 or localhost).");
    process.exit(1);
  }
}

const failures: string[] = [];
function expect(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures.push(name);
}

const JOB = "check-jobs";
type Row = {
  status: string;
  duration_ms: number | null;
  finished_at: string | null;
  result: Record<string, unknown>;
  error: string | null;
};
const latest = async () =>
  (
    (await db.execute(
      sql`select status, duration_ms, finished_at, result, error from public.job_runs where job = ${JOB} order by id desc limit 1`,
    )) as unknown as Row[]
  )[0];
const backupIds: number[] = [];

try {
  await db.execute(sql`delete from public.job_runs where job = ${JOB}`);

  const value = await recordJob(JOB, async () => ({ checked: 41, pushed: 2 }));
  let row = await latest();
  expect(
    "an ok run is recorded with its result, duration and finish time, and the job's value comes back",
    value.pushed === 2 && row?.status === "ok" && row.result.checked === 41 && row.duration_ms !== null && row.finished_at !== null,
    JSON.stringify(row),
  );

  const thrown = await recordJob(JOB, async () => {
    throw new Error("deadlock detected");
  }).catch((e: Error) => e.message);
  row = await latest();
  expect(
    "a throwing job is recorded as failed with its message and still throws",
    thrown === "deadlock detected" && row?.status === "failed" && row.error === "deadlock detected",
  );

  await recordJob(
    JOB,
    async () => ({ users: 5, ok: 2, new: 0, failed: 3, skipped: 0, disabled: 0, unknown: 0, errors: ["429"] }),
    judgeLeetcode,
  );
  row = await latest();
  expect("a judge sets the status and the error", row?.status === "failed" && row.error === "3 of 5 users failed: 429");

  await recordJob(JOB, async () => ({ results: Object.fromEntries(Array.from({ length: 300 }, (_, i) => [`user-${i}`, "ok (0 new)"])) }));
  row = await latest();
  expect("a big result is stored capped", row?.result.truncated === true && JSON.stringify(row.result).length < 2000);

  // The start write threw but had committed: the finish completes that running row instead of adding a second.
  const lostAt = new Date(Date.now() - 5000);
  await db.execute(sql`insert into public.job_runs (job, status, started_at) values (${JOB}, 'running', ${lostAt.toISOString()})`);
  const finishRow = {
    job: JOB,
    startedAt: lostAt,
    finishedAt: new Date(),
    status: "ok" as const,
    durationMs: 5000,
    result: { n: 1 },
    error: null,
  };
  await jobRunStore.finish({ id: null, ...finishRow });
  const atLost = async () =>
    (await db.execute(sql`select status from public.job_runs where job = ${JOB} and started_at = ${lostAt.toISOString()}`)) as unknown as {
      status: string;
    }[];
  const after = await atLost();
  expect(
    "a finish without a start id completes the committed running row, no duplicate",
    after.length === 1 && after[0]?.status === "ok",
    JSON.stringify(after),
  );
  // And with no running row to find, it writes the whole row.
  const freshAt = new Date(Date.now() - 3000);
  await jobRunStore.finish({ id: null, ...finishRow, startedAt: freshAt });
  const [fresh] = (await db.execute(
    sql`select count(*)::int as n from public.job_runs where job = ${JOB} and started_at = ${freshAt.toISOString()} and status = 'ok'`,
  )) as unknown as { n: number }[];
  expect("a finish without a start id and no running row inserts the whole run", fresh?.n === 1);

  await db.execute(sql`insert into public.job_runs (job, status, started_at) values
    (${JOB}, 'ok', now() - interval '91 days'), (${JOB}, 'ok', now() - interval '89 days')`);
  const pruned = await pruneJobRuns();
  const [left] = (await db.execute(
    sql`select count(*) filter (where started_at < now() - interval '90 days')::int as old, count(*)::int as n from public.job_runs where job = ${JOB}`,
  )) as unknown as { old: number; n: number }[];
  expect(
    "retention deletes runs older than 90 days and keeps the rest",
    pruned >= 1 && left?.old === 0 && left.n === 7,
    JSON.stringify(left),
  );

  // 16 backup runs, newest a minute ago: the section shows the newest 14 in the strip and 5 when opened.
  const inserted = (await db.execute(sql`
    insert into public.job_runs (job, status, started_at, finished_at, duration_ms, result)
    select 'db-backup', case when k = 3 then 'failed' else 'ok' end, now() - make_interval(mins => k), now() - make_interval(mins => k),
           112000, jsonb_build_object('bytes', 3248112 + k)
    from generate_series(1, 16) k
    returning id`)) as unknown as { id: number }[];
  backupIds.push(...inserted.map((r) => Number(r.id)));
  const { rows, caption } = await jobsOverview();
  const backup = rows.find((r) => r.id === "db-backup");
  expect(
    "the overview keeps the newest 14 runs per job, newest last in the strip",
    backup?.strip.length === STRIP_SIZE && !backup.strip.includes("none") && backup.strip.at(-3) === "failed" && backup.runs.length === 5,
    JSON.stringify(backup?.strip),
  );
  expect(
    "the newest run's result becomes the row's plain line",
    backup?.summary === "Backup 3.1 MB encrypted and uploaded" && backup.state === "ok",
    backup?.summary,
  );
  expect("every registry job has a row and the caption is written", rows.length === 5 && caption.length > 0, caption);
  expect("the check's own job is not on the page: only registry jobs are", !rows.some((r) => r.id === (JOB as string)));
} finally {
  await db.execute(sql`delete from public.job_runs where job = ${JOB}`);
  if (backupIds.length) await db.delete(jobRuns).where(inArray(jobRuns.id, backupIds));
}

if (failures.length) {
  console.error(`\n${failures.length} job check(s) failed`);
  process.exit(1);
}
console.log("\nAll job checks passed");
process.exit(0);
