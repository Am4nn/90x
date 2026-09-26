import { addDays } from "./dates";

// Day status for the 90 Grid, the streak, revive, and which mission a
// check-in ticks. Pure; the service reads and writes the rows.

export type DayStatus = "pending" | "done" | "partial" | "missed" | "revived";

const RESOLVED = new Set(["done", "skipped"]);

/** `closing` = the day is over (past midnight). Card slots and revive missions don't count. */
export function dayStatus(missions: { status: string; isRevive: boolean }[], closing: boolean): Exclude<DayStatus, "revived"> {
  const countable = missions.filter((m) => m.status !== "coming_soon" && !m.isRevive);
  const resolved = countable.filter((m) => RESOLVED.has(m.status)).length;
  if (resolved === countable.length) return "done";
  if (!closing) return "pending";
  return resolved > 0 ? "partial" : "missed";
}

const KEEPS_STREAK = new Set(["done", "revived"]);

/** Consecutive done/revived days ending yesterday, plus today once it's done. */
export function streak(days: { date: string; status: string }[], today: string): number {
  const status = new Map(days.map((d) => [d.date, d.status]));
  let n = KEEPS_STREAK.has(status.get(today) ?? "") ? 1 : 0;
  for (let d = addDays(today, -1); KEEPS_STREAK.has(status.get(d) ?? ""); d = addDays(d, -1)) n++;
  return n;
}

const REVIVE_WINDOW_DAYS = 2;

/** Missed or partial days from the last two days that can still be revived. */
export function revivable(days: { date: string; status: string }[], today: string): string[] {
  const from = addDays(today, -REVIVE_WINDOW_DAYS);
  return days
    .filter((d) => (d.status === "missed" || d.status === "partial") && d.date >= from && d.date < today)
    .map((d) => d.date)
    .toSorted();
}

type MissionRef = { id: string; slotType: string; ref: string; status: string; patternSlug: string | null };

/** The open mission a check-in ticks: the same problem, else a new-problem mission in the same pattern. */
export function matchMission(missions: MissionRef[], checkin: { slug: string; patternSlug: string | null }): string | null {
  const open = missions.filter((m) => m.status === "open" && (m.slotType === "new_problem" || m.slotType === "review"));
  const exact = open.find((m) => m.ref === checkin.slug);
  if (exact) return exact.id;
  if (!checkin.patternSlug) return null;
  return open.find((m) => m.slotType === "new_problem" && m.patternSlug === checkin.patternSlug)?.id ?? null;
}

export function latestPerProblem<T extends { slug: string; createdAt: string }>(checkins: T[]): T[] {
  const latest = new Map<string, T>();
  for (const c of checkins) {
    const prev = latest.get(c.slug);
    if (!prev || c.createdAt > prev.createdAt) latest.set(c.slug, c);
  }
  return [...latest.values()];
}
