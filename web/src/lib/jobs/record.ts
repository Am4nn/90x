// Records one run of a scheduled job: a `running` row when it starts, then status, duration, a short
// result and the error when it ends. The storage is passed in (store.ts writes job_runs), so the rules
// here are tested without a database.
//
// Recording must never make a job fail. A store error is logged and the job carries on; the job's own
// error is recorded and then rethrown, so QStash still sees the 500 and retries.

import { logError } from "@/lib/log";

type RunStatus = "ok" | "failed" | "skipped";

/** What a finished run comes to: its status, the result to keep, and why it failed. */
export type Outcome = { status: RunStatus; result?: unknown; error?: string };

/** Turns what a job returned into its outcome. Without one, a run that returns is `ok`. */
export type Judge<T> = (value: T) => Outcome;

export type FinishedRun = {
  /** The started row, or null when writing it failed (the store then writes the whole row). */
  id: number | null;
  job: string;
  startedAt: Date;
  finishedAt: Date;
  status: RunStatus;
  durationMs: number;
  result: unknown;
  error: string | null;
};

export type RunStore = {
  start(job: string, startedAt: Date): Promise<number>;
  finish(run: FinishedRun): Promise<void>;
};

/** The longest result kept, as JSON text. Results are meant to be counts, so this is generous. */
export const MAX_RESULT_CHARS = 2000;
const MAX_ERROR_CHARS = 2000;
const PREVIEW_CHARS = 300;

/** The result as plain JSON, or a stand-in that says how big it was when it is too big to keep. */
export function capResult(value: unknown): unknown {
  let text: string | undefined;
  try {
    text = JSON.stringify(value);
  } catch {
    return { unreadable: true };
  }
  if (text === undefined) return {};
  if (text.length <= MAX_RESULT_CHARS) return JSON.parse(text);
  return { truncated: true, chars: text.length, preview: text.slice(0, PREVIEW_CHARS) };
}

const capError = (text: string) => (text.length > MAX_ERROR_CHARS ? `${text.slice(0, MAX_ERROR_CHARS - 1)}…` : text);

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e)) || "failed with no message";

async function quietly<T>(what: string, job: string, write: () => Promise<T>): Promise<T | null> {
  try {
    return await write();
  } catch (e) {
    logError(`job_runs: could not ${what} the ${job} run`, e);
    return null;
  }
}

export async function recordRun<T>(
  job: string,
  run: () => Promise<T>,
  { store, judge, clock = () => new Date() }: { store: RunStore; judge?: Judge<T>; clock?: () => Date },
): Promise<T> {
  const startedAt = clock();
  // Not awaited before run(): a slow start write must never hold up the job. finish waits for it, so a late
  // insert is still completed exactly once.
  const started = quietly("start", job, () => store.start(job, startedAt));
  const finish = async (o: Outcome) => {
    const finishedAt = clock();
    const id = await started;
    return quietly("finish", job, () =>
      store.finish({
        id,
        job,
        startedAt,
        finishedAt,
        status: o.status,
        durationMs: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
        result: capResult(o.result ?? {}),
        error: o.error ? capError(o.error) : null,
      }),
    );
  };

  let value: T;
  try {
    value = await run();
  } catch (e) {
    await finish({ status: "failed", error: messageOf(e) });
    throw e;
  }
  let outcome: Outcome;
  try {
    outcome = judge ? judge(value) : { status: "ok", result: value };
  } catch (e) {
    logError(`job_runs: could not judge the ${job} run`, e);
    outcome = { status: "ok", result: value };
  }
  await finish(outcome);
  return value;
}
