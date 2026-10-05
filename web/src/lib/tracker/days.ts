import { addDays } from "./dates";

// Day status for the 90 Grid, the streak, revive, and which mission a
// check-in ticks. Pure; the service reads and writes the rows.

/** "rest": nothing countable was planned (catalog empty, cards-only day); it neither extends nor breaks the streak. */
export type DayStatus = "pending" | "done" | "partial" | "missed" | "revived" | "rest";

const RESOLVED = new Set(["done", "skipped"]);

/** `closing` = the day is over (past midnight). Card slots and revive missions don't count. */
export function dayStatus(
  missions: { status: string; isRevive: boolean; isExtra?: boolean }[],
  closing: boolean,
): Exclude<DayStatus, "revived"> {
  // Revive missions belong to another day; extra ones (added by Coach or a
  // solution review) are bonus work and never reopen a finished day.
  const countable = missions.filter((m) => m.status !== "coming_soon" && !m.isRevive && !m.isExtra);
  if (!countable.length) return "rest";
  const resolved = countable.filter((m) => RESOLVED.has(m.status)).length;
  if (resolved === countable.length) return "done";
  if (!closing) return "pending";
  return resolved > 0 ? "partial" : "missed";
}

const KEEPS_STREAK = new Set(["done", "revived"]);

/** Consecutive done/revived days ending yesterday, plus today once it's done. Rest days are stepped over. */
export function streak(days: { date: string; status: string }[], today: string): number {
  const status = new Map(days.map((d) => [d.date, d.status]));
  let n = KEEPS_STREAK.has(status.get(today) ?? "") ? 1 : 0;
  for (let d = addDays(today, -1); ; d = addDays(d, -1)) {
    const s = status.get(d) ?? "";
    if (s === "rest") continue;
    if (!KEEPS_STREAK.has(s)) break;
    n++;
  }
  return n;
}

const REVIVE_WINDOW_DAYS = 2;

/** Missed or partial days from the last two days that can still be revived, leaving out ones already `started`. */
export function revivable(days: { date: string; status: string }[], today: string, started: string[] = []): string[] {
  const from = addDays(today, -REVIVE_WINDOW_DAYS);
  return days
    .filter((d) => (d.status === "missed" || d.status === "partial") && d.date >= from && d.date < today && !started.includes(d.date))
    .map((d) => d.date)
    .toSorted();
}

/** Days whose revive missions (on today's list) are all done. Skipping one ("Not today") doesn't finish a revive. */
export function revivedDates(missions: { status: string; isRevive: boolean; reviveOf: string | null }[]): string[] {
  const complete = new Map<string, boolean>();
  for (const m of missions) {
    if (!m.isRevive || !m.reviveOf) continue;
    complete.set(m.reviveOf, (complete.get(m.reviveOf) ?? true) && m.status === "done");
  }
  return [...complete].filter(([, done]) => done).map(([date]) => date);
}

/**
 * The ref a mission gets when a revive copies it into today. Card missions are
 * interchangeable "10 cards" missions (cards-1 each day, more when a reader asks
 * for extras), so a copied one takes the missed day's date to stay distinct from
 * today's own.
 */
export function reviveRef(mission: { slotType: string; ref: string }, date: string): string {
  return mission.slotType === "cards" ? `${mission.ref}-${date}` : mission.ref;
}

/** At most this many extra missions a day, so a click storm cannot flood Today. */
export const MAX_EXTRAS_PER_DAY = 5;

/** Whether today has room for another extra mission; the Coach's queued ones count, revive ones do not. */
export function hasExtraRoom(missions: { isExtra: boolean }[]): boolean {
  return missions.filter((m) => m.isExtra).length < MAX_EXTRAS_PER_DAY;
}

/** The ref for the next extra "10 cards" mission: cards-extra-1, then 2, ... skipping any taken. */
export function nextExtraCardsRef(refs: string[]): string {
  const taken = new Set(refs);
  let n = 1;
  while (taken.has(`cards-extra-${n}`)) n++;
  return `cards-extra-${n}`;
}

type MissionRef = { id: string; slotType: string; ref: string; status: string; patternSlug: string | null; isRevive?: boolean };

/**
 * The open mission a check-in ticks: the same problem, else a new-problem
 * mission in the same pattern. Today's own missions win over revive ones.
 */
export function matchMission(missions: MissionRef[], checkin: { slug: string; patternSlug: string | null }): string | null {
  const open = missions
    .filter((m) => m.status === "open" && (m.slotType === "new_problem" || m.slotType === "review"))
    .toSorted((a, b) => Number(Boolean(a.isRevive)) - Number(Boolean(b.isRevive)));
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

const CARDS_PER_MISSION = 10;

/** The day's own card mission first, then revive ones, then extras the reader asked for. */
const cardRank = (m: { isRevive?: boolean; isExtra?: boolean }) => (m.isExtra ? 2 : m.isRevive ? 1 : 0);

/**
 * Which open "cards" missions today's answers now complete: one per 10
 * non-skipped answers, counting the missions already done. Today's own card
 * missions come first, then ones copied in by a revive, then extra ones.
 */
export function cardMissionsToTick(
  missions: { id: string; slotType: string; status: string; isRevive?: boolean; isExtra?: boolean }[],
  answeredToday: number,
): string[] {
  const cardMissions = missions
    .filter((m) => m.slotType === "cards" && (m.status === "open" || m.status === "done"))
    .toSorted((a, b) => cardRank(a) - cardRank(b));
  const owed = Math.min(Math.floor(answeredToday / CARDS_PER_MISSION), cardMissions.length);
  const done = cardMissions.filter((m) => m.status === "done").length;
  return cardMissions
    .filter((m) => m.status === "open")
    .slice(0, Math.max(0, owed - done))
    .map((m) => m.id);
}

/**
 * What opening Today has to write before it can be read, decided from rows already read.
 * `rows` holds every day row of the active campaign, plus any still-pending day (of any
 * campaign) before `closeBefore`.
 *
 * - close: a past day is still pending, or the days between the campaign's last row and
 *   `closeBefore` have no row yet (the app wasn't opened): closePastDays has work to do.
 * - claim: today has no row yet, so it may need planning (`today` null: the campaign has
 *   ended, there is nothing to claim).
 *
 * Neither: Today was already opened today, and the page is a pure read.
 */
export function dayWork(
  rows: { date: string; status: string; campaignId: string }[],
  campaign: { id: string; startDate: string },
  closeBefore: string,
  today: string | null,
): { close: boolean; claim: boolean } {
  let last: string | null = null;
  for (const r of rows) if (r.campaignId === campaign.id && (last === null || r.date > last)) last = r.date;
  const gapFrom = last ? addDays(last, 1) : campaign.startDate;
  const close = gapFrom < closeBefore || rows.some((r) => r.status === "pending" && r.date < closeBefore);
  const claim = today !== null && !rows.some((r) => r.date === today);
  return { close, claim };
}
