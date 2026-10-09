import { addDays, DAY_NAMES, daysBetween, shortDate, weekday } from "./dates";

// Day status for the 90 Grid, the streak, revive, and which mission a
// check-in ticks. Pure; the service reads and writes the rows.

/** "rest": nothing countable was planned (catalog empty, cards-only day); it neither extends nor breaks the streak. */
export type DayStatus = "pending" | "done" | "partial" | "missed" | "revived" | "rest";

const RESOLVED = new Set(["done", "skipped"]);

/** `closing` = the day is over (past midnight). Revive, extra and coming-soon missions don't count. */
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
 * interchangeable "10 cards" missions (cards-1 each day), so a copied one takes the missed day's date to stay distinct from
 * today's own.
 */
export function reviveRef(mission: { slotType: string; ref: string }, date: string): string {
  return mission.slotType === "cards" ? `${mission.ref}-${date}` : mission.ref;
}

/** The most open extras one reader can hold, a hidden abuse cap: nobody meets it by hand, and the reader is never told the number. */
export const MAX_OPEN_EXTRAS = 100;

/** Whether the reader can add another extra, given how many they hold open (any date). */
export function hasExtraRoom(openExtras: number): boolean {
  return openExtras < MAX_OPEN_EXTRAS;
}

/** The same piece of work: a problem is one whether the plan sees it as new or as a review; a topic only matches a topic. */
const sameWork = (a: { slotType: string; ref: string }, b: { slotType: string; ref: string }) =>
  a.ref === b.ref && (a.slotType === "topic") === (b.slotType === "topic");

/**
 * Plan rows whose problem or topic is already one of the reader's open extras
 * from an earlier day. Such a row is the extra, moved up: it takes a note on its
 * reason and the old extra row is dropped (`consumed`). The planner never leans
 * toward extras; it only is not blocked by them.
 */
export function promoteExtras<T extends { slotType: string; ref: string; reason: string }>(
  planned: T[],
  extras: { id: string; slotType: string; ref: string }[],
): { planned: T[]; consumed: string[] } {
  const consumed: string[] = [];
  const out = planned.map((m) => {
    const hits = extras.filter((x) => sameWork(x, m));
    if (!hits.length) return m;
    consumed.push(...hits.map((x) => x.id));
    return { ...m, reason: `${m.reason} · moved from your extras` };
  });
  return { planned: out, consumed };
}

/** The reason line of an Extras row: when it was added, as a weekday within the last week, else the date. */
export function extraReason(reason: string, added: string, today: string): string {
  const age = daysBetween(added, today);
  const when = age <= 0 ? "today" : age < 7 ? DAY_NAMES[weekday(added)] : shortDate(added);
  return reason === "Added by Coach" || reason.endsWith("Added with Coach") ? `${reason} · ${when}` : `${reason} · added ${when}`;
}

type MissionRef = {
  id: string;
  slotType: string;
  ref: string;
  status: string;
  patternSlug: string | null;
  isRevive?: boolean;
  isExtra?: boolean;
};

/**
 * The open mission a check-in ticks, best first:
 * the planned mission for that problem, an extra for it, a planned new problem
 * in the same pattern, a revive one, then an extra in the same pattern. A solved
 * planned problem is therefore never taken by an extra; extras from earlier days
 * are in `missions` too (the caller reads them), so a check-in can finish one.
 * An exact match on a revive mission outranks a planned same-pattern one on purpose
 *: solving X should tick X, as it always has.
 */
export function matchMission(missions: MissionRef[], checkin: { slug: string; patternSlug: string | null }): string | null {
  const open = missions.filter((m) => m.status === "open" && (m.slotType === "new_problem" || m.slotType === "review"));
  const planned = (m: MissionRef) => !m.isExtra && !m.isRevive;
  const exact = (m: MissionRef) => m.ref === checkin.slug;
  const samePattern = (m: MissionRef) =>
    Boolean(checkin.patternSlug) && m.slotType === "new_problem" && m.patternSlug === checkin.patternSlug;
  const tiers: ((m: MissionRef) => boolean)[] = [
    (m) => exact(m) && planned(m),
    (m) => exact(m) && Boolean(m.isExtra),
    (m) => exact(m),
    (m) => samePattern(m) && planned(m),
    (m) => samePattern(m) && Boolean(m.isRevive) && !m.isExtra,
    samePattern,
  ];
  for (const tier of tiers) {
    const hit = open.find(tier);
    if (hit) return hit.id;
  }
  return null;
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
