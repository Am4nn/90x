import { applyCheckin, type Result, type Review } from "@/lib/tracker/ladder";
import { bonusAward, capCard, cardAward, checkinAward, dayBonusDue, topicAward, type XpAward, type XpKind } from "./rules";

// The one-off history back-fill: what a user's past would have earned under
// today's rules. Pure, so the rules are tested with fixture rows; the script
// (scripts/backfill-xp.ts) only reads rows, calls this and inserts the result.

export type BackfillInput = {
  /** Check-ins, with `day` the reader's local day. Any order. */
  checkins: { id: string; slug: string; result: Result; at: string; day: string }[];
  /** Studied topics, with the local day they were studied. */
  studied: { slug: string; day: string }[];
  /** Feed answers, with the local day. */
  cards: { cardId: string; at: string; day: string; outcome: string; gradedBy: string }[];
  /** Each day that has missions, with those missions' state. */
  days: { date: string; missions: { status: string; isRevive: boolean; isExtra: boolean }[] }[];
  /** Events already stored, so a re-run adds nothing and the caps count what is there. */
  existing: XpRow[];
};

export type XpRow = XpAward & { day: string };

const key = (r: { kind: XpKind; ref: string; day: string }) => `${r.kind}|${r.ref}|${r.day}`;

/** The rows to insert: everything `input` earns that `input.existing` does not already hold. */
export function computeBackfill(input: BackfillInput): XpRow[] {
  const held = new Set(input.existing.map(key));
  // "Once, ever" kinds: an existing problem or topic event on any day blocks another.
  const onceEver = new Set(input.existing.filter((r) => r.kind === "problem" || r.kind === "topic").map((r) => `${r.kind}|${r.ref}`));
  const out: XpRow[] = [];
  const add = (row: XpRow) => {
    if (held.has(key(row))) return false;
    if ((row.kind === "problem" || row.kind === "topic") && onceEver.has(`${row.kind}|${row.ref}`)) return false;
    held.add(key(row));
    if (row.kind === "problem" || row.kind === "topic") onceEver.add(`${row.kind}|${row.ref}`);
    out.push(row);
    return true;
  };

  // Check-ins: replay in order, the way they arrived, so the review ladder is in
  // the state each one found it in.
  const reviews = new Map<string, Review>();
  const solvedBefore = new Set<string>();
  const ordered = input.checkins.toSorted((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  for (const c of ordered) {
    const award = checkinAward({
      slug: c.slug,
      result: c.result,
      day: c.day,
      firstSolve: c.result !== "failed" && !solvedBefore.has(c.slug),
      review: reviews.get(c.slug) ?? null,
    });
    if (award) add({ ...award, day: c.day });
    if (c.result !== "failed") solvedBefore.add(c.slug);
    const next = applyCheckin(reviews.get(c.slug) ?? null, c.result, c.day);
    if (next) reviews.set(c.slug, next);
  }

  for (const s of input.studied) add({ ...topicAward(s.slug), day: s.day });

  // Cards: in order, so the daily caps fill the way they would have live.
  const used = new Map<string, { total: number; ai: number }>();
  for (const r of input.existing) {
    if (r.kind !== "card" && r.kind !== "card_ai") continue;
    const u = used.get(r.day) ?? { total: 0, ai: 0 };
    u.total += r.xp;
    if (r.kind === "card_ai") u.ai += r.xp;
    used.set(r.day, u);
  }
  for (const a of input.cards.toSorted((x, y) => x.at.localeCompare(y.at))) {
    const award = cardAward(a);
    if (!award || (award.kind !== "card" && award.kind !== "card_ai")) continue;
    if (held.has(key({ ...award, day: a.day }))) continue;
    const u = used.get(a.day) ?? { total: 0, ai: 0 };
    const xp = capCard({ kind: award.kind, xp: award.xp }, u);
    if (xp <= 0) continue;
    add({ ...award, xp, day: a.day });
    u.total += xp;
    if (award.kind === "card_ai") u.ai += xp;
    used.set(a.day, u);
  }

  for (const d of input.days) if (dayBonusDue(d.missions)) add({ ...bonusAward(d.date), day: d.date });
  return out.toSorted((a, b) => a.day.localeCompare(b.day) || a.kind.localeCompare(b.kind) || a.ref.localeCompare(b.ref));
}

/** Totals by kind, for the script's report. */
export function summarize(rows: XpRow[]): Record<string, { events: number; xp: number }> {
  const by: Record<string, { events: number; xp: number }> = {};
  for (const r of rows) {
    const s = (by[r.kind] ??= { events: 0, xp: 0 });
    s.events++;
    s.xp += r.xp;
  }
  return by;
}
