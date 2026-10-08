import { logError } from "@/lib/log";
import { addDays, DAY_NAMES, daysBetween, localDate, weekday } from "@/lib/tracker/dates";
import { nextRun, previousRun } from "./cron";
import { summarize } from "./outcomes";
import { type JobDef, JOBS } from "./registry";

// Turns job_runs rows and the registry into what the Scheduled jobs section draws: a status per job, the
// last run in words, the next run, a 14-run strip and the last few runs in full. Pure, so it is tested
// with a fixed clock. Times are shown in IST, the owner's zone.

const SHOWN_TZ = "Asia/Kolkata";
export const STRIP_SIZE = 14;
const OPEN_RUNS = 5;
/** A run still `running` after this long was stopped (Vercel's time limit or a crash) before it could finish. */
const STUCK_MINUTES = 15;
/** How much earlier than its due time a run may have started and still count for it. */
const EARLY_SLACK_MINUTES = 5;

export type StoredRun = {
  id: number;
  job: string;
  startedAt: string;
  finishedAt: string | null;
  status: string;
  durationMs: number | null;
  result: unknown;
  error: string | null;
};

type RunState = "ok" | "failed" | "skipped" | "running";
export type JobState = RunState | "never" | "late";

type RunView = { id: number; when: string; state: RunState; duration: string; error: string | null; raw: string };

export type JobView = {
  id: string;
  name: string;
  where: string;
  state: JobState;
  /** The last run in words, or "No run recorded yet". */
  summary: string;
  /** "Today 14:35 · took 2.9 s", or "Never". */
  last: string;
  next: { label: string; detail: string };
  /** Oldest first, padded with "none" on the left to STRIP_SIZE. */
  strip: (RunState | "none")[];
  runs: RunView[];
};

const minutes = (n: number) => n * 60_000;

function stateOf(run: StoredRun, now: Date): { state: RunState; error: string | null } {
  if (run.status === "running" && now.getTime() - Date.parse(run.startedAt) > minutes(STUCK_MINUTES)) {
    return { state: "failed", error: run.error ?? "No finish recorded: the run was stopped (time limit or crash)" };
  }
  const known: RunState[] = ["ok", "failed", "skipped", "running"];
  return { state: known.includes(run.status as RunState) ? (run.status as RunState) : "failed", error: run.error };
}

const timeFormat = new Intl.DateTimeFormat("en-GB", { timeZone: SHOWN_TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

function dayLabel(date: string, now: Date): string {
  const gap = daysBetween(localDate(SHOWN_TZ, now), date);
  if (gap === 0) return "Today";
  if (gap === 1) return "Tomorrow";
  if (gap === -1) return "Yesterday";
  const d = new Date(`${date}T00:00:00Z`);
  return `${DAY_NAMES[weekday(date)]} ${d.getUTCDate()} ${d.toLocaleString("en", { month: "short", timeZone: "UTC" })}`;
}

/** "Today 14:35", "Tomorrow 05:35", "Sun 25 Oct 05:35", in IST. */
export const formatWhen = (at: Date, now: Date) => `${dayLabel(localDate(SHOWN_TZ, at), now)} ${timeFormat.format(at)}`;

/** "0.4 s", "41 s", "1 m 52 s". */
export function formatDuration(ms: number | null): string {
  if (ms === null) return "";
  if (ms < 10_000) return `${(ms / 1000).toFixed(1)} s`;
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} m ${s % 60} s`;
}

/** When the job runs next. A reader-clock job runs on its weekday wherever a reader is, so it shows the day. */
export function nextOf(def: JobDef, now: Date): { at: Date; label: string; detail: string } {
  if ("cron" in def.schedule) {
    const at = nextRun(def.schedule.cron, now);
    return { at, label: formatWhen(at, now), detail: "next run" };
  }
  const { weekday: day, hour } = def.schedule.readerClock;
  const today = localDate(SHOWN_TZ, now);
  const date = addDays(today, (day - weekday(today) + 7) % 7);
  const time = hour === 12 ? "noon" : `${hour % 12 || 12} ${hour < 12 ? "am" : "pm"}`;
  return { at: new Date(`${date}T00:00:00Z`), label: dayLabel(date, now), detail: `${time}, reader time` };
}

/** A run that should have started by now (plus the job's grace) is missing. Never-run jobs are not late: they are "never". */
export function isLate(def: JobDef, latest: StoredRun | undefined, now: Date): boolean {
  if (!latest || def.graceMinutes === null || !("cron" in def.schedule)) return false;
  const due = previousRun(def.schedule.cron, new Date(now.getTime() - minutes(def.graceMinutes)));
  return Date.parse(latest.startedAt) < due.getTime() - minutes(EARLY_SLACK_MINUTES);
}

/** One job's row. `runs` are its own, newest first. */
export function jobView(def: JobDef, runs: StoredRun[], now: Date): JobView {
  const latest = runs[0];
  const next = nextOf(def, now);
  const strip: JobView["strip"] = runs
    .slice(0, STRIP_SIZE)
    .map((r) => stateOf(r, now).state)
    .toReversed();
  while (strip.length < STRIP_SIZE) strip.unshift("none");
  const base = { id: def.id, name: def.name, where: def.where, strip };
  if (!latest) {
    return {
      ...base,
      state: "never",
      summary: "No run recorded yet",
      last: "Never",
      next: { ...next, label: `First due ${next.label}` },
      runs: [],
    };
  }
  const { state, error } = stateOf(latest, now);
  const took = latest.durationMs === null ? "" : ` · took ${formatDuration(latest.durationMs)}`;
  return {
    ...base,
    state: isLate(def, latest, now) ? "late" : state,
    summary: summarize(def.id, state, latest.result, error),
    last: `${formatWhen(new Date(latest.startedAt), now)}${took}`,
    next,
    runs: runs.slice(0, OPEN_RUNS).map((r) => {
      const s = stateOf(r, now);
      return {
        id: r.id,
        when: formatWhen(new Date(r.startedAt), now),
        state: s.state,
        duration: formatDuration(r.durationMs),
        error: s.error,
        raw: JSON.stringify(r.result),
      };
    }),
  };
}

const lower = (when: string) => when.replace(/^(Today|Tomorrow|Yesterday)/, (w) => w.toLowerCase());
const names = (rows: JobView[]) => rows.map((r) => r.name).join(", ");

/** The "In plain words" line under the jobs. */
export function jobsCaption(rows: JobView[]): string {
  if (rows.every((r) => r.state === "never")) {
    return "No job has recorded a run yet. If that lasts past the first due time, the QStash schedules were probably never created: run bun run schedule:jobs after deploying.";
  }
  const failed = rows.filter((r) => r.state === "failed");
  const late = rows.filter((r) => r.state === "late");
  const never = rows.filter((r) => r.state === "never");
  const out: string[] = [];
  if (!failed.length && !late.length) out.push(never.length ? "Nothing has failed." : "Every job ran when it was due.");
  for (const r of failed) {
    const at = r.runs[0]?.when ?? "";
    out.push(`${r.name} failed ${lower(at)}: ${r.summary}. It runs again ${lower(r.next.label)}.`);
  }
  if (late.length)
    out.push(
      `${names(late)} ${late.length === 1 ? "is" : "are"} late: no run recorded since ${late.map((r) => lower(r.last.split(" · ")[0] ?? "")).join(", ")}.`,
    );
  if (never.length) out.push(`${names(never)} ${never.length === 1 ? "has" : "have"} not run yet.`);
  return out.join(" ");
}

export type JobsOverview = { rows: JobView[]; caption: string };

export const UNREADABLE_CAPTION =
  "job_runs could not be read, so no run is shown (the error is in the server log). If the job_runs migration has not been applied yet, apply it.";

/** The whole section from a read of job_runs. A failed read never takes the page down: every job shows as
 *  never ran and the caption says the runs could not be read. */
export async function buildOverview(read: () => Promise<StoredRun[]>, now: Date): Promise<JobsOverview> {
  let runs: StoredRun[];
  try {
    runs = await read();
  } catch (e) {
    logError("job_runs could not be read", e);
    return { rows: JOBS.map((def) => jobView(def, [], now)), caption: UNREADABLE_CAPTION };
  }
  const rows = JOBS.map((def) =>
    jobView(
      def,
      runs.filter((r) => r.job === def.id),
      now,
    ),
  );
  return { rows, caption: jobsCaption(rows) };
}
