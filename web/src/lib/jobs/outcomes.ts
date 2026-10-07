import type { Outcome } from "./record";

// What each job returns, how a run of it is judged (ok, failed, skipped) and the one plain line the admin
// page shows for it. Results are short counts on purpose: they are kept for 90 days in job_runs.

type Counts = Record<string, number>;

/** The hourly tick: readers looked at, jobs due this hour, and how each kind went. */
export type HourlyResult = { users: number; due: number; ok: Counts; failed: Counts; sweep?: "ok" | "failed" };
export type WeeklyResult = { written: number; already_done: number; failed: number };
export type SweepResult = { hidden: number };
export type LeetcodeResult = {
  users: number;
  ok: number;
  new: number;
  failed: number;
  skipped: number;
  disabled: number;
  /** Readers whose LeetCode name LeetCode doesn't know: a typo they can fix, not a failure. */
  unknown: number;
  /** Up to three distinct reasons, so the page can say why without keeping one line per user. */
  errors: string[];
};

const total = (c: Counts) => Object.values(c).reduce((s, n) => s + n, 0);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Adds one to `key`. */
export const tally = (c: Counts, key: string) => {
  c[key] = (c[key] ?? 0) + 1;
};

export function judgeHourly(r: HourlyResult): Outcome {
  const failed = total(r.failed);
  if (failed || r.sweep === "failed") {
    const what = [...Object.keys(r.failed), ...(r.sweep === "failed" ? ["stale sweep"] : [])].join(", ");
    return { status: "failed", result: r, error: `${failed} of ${r.due} due failed${what ? ` (${what})` : ""}` };
  }
  return { status: r.due === 0 && !r.sweep ? "skipped" : "ok", result: r };
}

export function judgeWeekly(r: WeeklyResult): Outcome {
  const all = r.written + r.already_done + r.failed;
  if (r.failed) return { status: "failed", result: r, error: `${r.failed} of ${all} weekly reviews failed` };
  return { status: all ? "ok" : "skipped", result: r };
}

export function judgeLeetcode(r: LeetcodeResult): Outcome {
  if (r.failed) {
    const why = r.errors.length ? `: ${r.errors.join("; ")}` : "";
    return { status: "failed", result: r, error: `${r.failed} of ${r.users} users failed${why}` };
  }
  return { status: r.ok ? "ok" : "skipped", result: r };
}

// ---- the plain line on the admin page -------------------------------------------------------------------
// Rows come back from the database, so every reader below copes with a missing or odd field: an older
// shape, a capped result, a hand-written backup row.

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const has = (r: Json, ...keys: string[]) => keys.every((k) => k in r);

const KIND: Record<string, [string, string]> = {
  morning: ["morning plan", "morning plans"],
  evening: ["evening reminder", "evening reminders"],
  rollover: ["day rollover", "day rollovers"],
  weekly: ["weekly review", "weekly reviews"],
};
const kindText = (kind: string, n: number) => (KIND[kind] ? plural(n, ...KIND[kind]) : `${n} ${kind}`);

function hourlyLine(r: Json): string {
  const due = num(r.due);
  const done = Object.entries(obj(r.ok)).map(([k, n]) => kindText(k, num(n)));
  const failed = Object.entries(obj(r.failed)).map(([k, n]) => `${num(n)} ${k} failed`);
  const sweep = r.sweep === "failed" ? ["stale sweep failed"] : [];
  const parts = [...done, ...failed, ...sweep];
  return `${plural(num(r.users), "reader")} checked, ${due ? `${due} due` : "nothing due"}${parts.length ? `: ${parts.join(", ")}` : ""}`;
}

function leetcodeLine(r: Json, error: string | null): string {
  const users = num(r.users);
  if (!users) return "Nobody has a LeetCode name to sync";
  const unknown = num(r.unknown);
  const notFound = unknown ? `${plural(unknown, "LeetCode name")} not found` : "";
  const also = notFound ? `; ${notFound}` : "";
  if (num(r.failed)) return `${error ?? `${num(r.failed)} of ${users} users failed`}${also}`;
  if (!num(r.ok)) {
    const waiting = users - unknown;
    return `Nothing synced: ${[notFound, waiting ? `${plural(waiting, "user")} waiting or turned off` : ""].filter(Boolean).join(", ")}`;
  }
  return `Synced ${num(r.ok)} of ${plural(users, "user")}, ${plural(num(r.new), "new check-in")}${also}`;
}

const megabytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/** The one line the page shows for a run: what it did, or why it failed. */
export function summarize(job: string, status: string, result: unknown, error: string | null): string {
  const r = obj(result);
  if (status === "running") return "Running now";
  if (r.truncated) return `Result too big to keep (${num(r.chars).toLocaleString("en")} characters)`;
  if (job === "hourly" && has(r, "users", "due")) return hourlyLine(r);
  if (job === "stale-sweep" && has(r, "hidden")) {
    const n = num(r.hidden);
    return n ? `Hid ${plural(n, "card")}` : "Hid 0 cards (none skipped by everyone for 14 days)";
  }
  if (job === "weekly-reviews" && has(r, "written")) {
    const failed = num(r.failed) ? `, ${num(r.failed)} failed` : "";
    return `Wrote ${plural(num(r.written), "review")}, ${num(r.already_done)} already done${failed}`;
  }
  if (job === "leetcode-sync" && has(r, "users")) return leetcodeLine(r, error);
  if (job === "db-backup" && status === "ok" && num(r.bytes)) return `Backup ${megabytes(num(r.bytes))} encrypted and uploaded`;
  if (error) return error;
  return status === "skipped" ? "Nothing to do" : status === "failed" ? "Failed" : "Done";
}
