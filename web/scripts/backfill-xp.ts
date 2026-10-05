// One-off back-fill of XP history: what each user's past would have earned
// under the same rules the app uses now (src/lib/xp/rules.ts), from their
// check-ins, studied topics, Feed answers and finished days, with the daily card
// caps applied. Run with `bun run backfill:xp` (a dry run that only reads and
// prints) or `bun run backfill:xp -- --apply` (one transaction that writes).
// It is safe to run twice: the second run finds nothing to add, because what is
// already in xp_events is counted first (and the unique keys refuse a duplicate
// even if a live award lands between the read and the write).
//
// Run it once, right after the migration and before the release that awards XP
// live, or just after: either order ends in the same rows. What it counts:
//
//   - check-ins: a first solve 30 (20 with hints) on the day it was made; a clean
//     solve of a review that was due 15 (the ladder is replayed from the
//     check-ins alone, so a review the reader later dismissed by hand is still
//     counted: the one place this can pay a little more than live would have)
//   - studied topics (topic_progress): 20 on the day studied
//   - card answers: a correct one graded by match or pure 2, by the model 1; once
//     a card a day; 100 a day in all, 10 a day from the model
//   - finished days: 20 for each day the grid counts as done (every counted mission
//     done or set aside)
//
// A "day" is the user's local day (profiles.timezone, UTC when there is no
// profile), the same rule the app uses.

import postgres from "postgres";
import { localDate } from "@/lib/tracker/dates";
import type { Result } from "@/lib/tracker/ladder";
import { computeBackfill, summarize, type XpRow } from "@/lib/xp/backfill";

const url = process.env.DIRECT_URL;
if (!url) {
  console.error("DIRECT_URL is not set. See .env.example.");
  process.exit(1);
}

const apply = process.argv.includes("--apply");
const sql = postgres(url, { prepare: false, max: 1 });

const CHUNK = 1000;

console.log(apply ? "APPLY: writing in one transaction.\n" : "DRY RUN: nothing is written. Pass --apply to change data.\n");

const group = <T extends { user_id: string }>(rows: T[]) => {
  const by = new Map<string, T[]>();
  for (const r of rows) by.set(r.user_id, [...(by.get(r.user_id) ?? []), r]);
  return by;
};

try {
  await sql.begin(async (tx) => {
    if (!apply) await tx`set transaction read only`;

    const [profiles, checkins, studied, cards, missions, existing] = await Promise.all([
      tx<{ user_id: string; timezone: string | null }[]>`select user_id, timezone from public.profiles`,
      tx<{ id: string; user_id: string; problem_slug: string; result: string; created_at: Date }[]>`
        select id, user_id, problem_slug, result, created_at from public.checkins`,
      tx<{ user_id: string; topic_slug: string; studied_at: Date }[]>`select user_id, topic_slug, studied_at from public.topic_progress`,
      tx<{ user_id: string; card_id: string; outcome: string; graded_by: string; created_at: Date }[]>`
        select user_id, card_id, outcome, graded_by, created_at from public.card_reviews`,
      tx<{ user_id: string; date: string; status: string; is_revive: boolean; is_extra: boolean }[]>`
        select user_id, date::text as date, status, is_revive, is_extra from public.missions`,
      tx<{ user_id: string; kind: string; ref: string; day: string; xp: number }[]>`
        select user_id, kind, ref, day::text as day, xp from public.xp_events`,
    ]);

    const zone = new Map(profiles.map((p) => [p.user_id, p.timezone ?? "UTC"]));
    const checkinsBy = group(checkins);
    const studiedBy = group(studied);
    const cardsBy = group(cards);
    const missionsBy = group(missions);
    const existingBy = group(existing);
    const users = new Set([...checkinsBy.keys(), ...studiedBy.keys(), ...cardsBy.keys(), ...missionsBy.keys()]);

    const toWrite: (XpRow & { user_id: string })[] = [];
    for (const userId of users) {
      const tz = zone.get(userId) ?? "UTC";
      const dayOf = (at: Date) => localDate(tz, at);

      const byDate = new Map<string, { status: string; isRevive: boolean; isExtra: boolean }[]>();
      for (const m of missionsBy.get(userId) ?? []) {
        byDate.set(m.date, [...(byDate.get(m.date) ?? []), { status: m.status, isRevive: m.is_revive, isExtra: m.is_extra }]);
      }

      const rows = computeBackfill({
        checkins: (checkinsBy.get(userId) ?? []).map((c) => ({
          id: c.id,
          slug: c.problem_slug,
          result: c.result as Result,
          at: c.created_at.toISOString(),
          day: dayOf(c.created_at),
        })),
        studied: (studiedBy.get(userId) ?? []).map((s) => ({ slug: s.topic_slug, day: dayOf(s.studied_at) })),
        cards: (cardsBy.get(userId) ?? []).map((c) => ({
          cardId: c.card_id,
          at: c.created_at.toISOString(),
          day: dayOf(c.created_at),
          outcome: c.outcome,
          gradedBy: c.graded_by,
        })),
        days: [...byDate].map(([date, list]) => ({ date, missions: list })),
        existing: (existingBy.get(userId) ?? []).map((e) => ({ kind: e.kind as XpRow["kind"], ref: e.ref, day: e.day, xp: e.xp })),
      });
      toWrite.push(...rows.map((r) => ({ ...r, user_id: userId })));
    }

    console.log(`Users with history: ${users.size}; events already stored: ${existing.length}`);
    console.log("Would add:");
    for (const [kind, s] of Object.entries(summarize(toWrite)))
      console.log(`  ${kind.padEnd(8)} ${String(s.events).padStart(7)} events  ${String(s.xp).padStart(8)} XP`);
    const total = toWrite.reduce((n, r) => n + r.xp, 0);
    console.log(
      `  total    ${String(toWrite.length).padStart(7)} events  ${String(total).padStart(8)} XP, across ${new Set(toWrite.map((r) => r.user_id)).size} users`,
    );

    if (apply) {
      let inserted = 0;
      for (let i = 0; i < toWrite.length; i += CHUNK) {
        const chunk = toWrite.slice(i, i + CHUNK);
        const done = await tx`
          insert into public.xp_events ${tx(chunk, "user_id", "day", "kind", "ref", "xp")}
          on conflict do nothing returning id`;
        inserted += done.length;
      }
      console.log(
        `\nInserted ${inserted} events${inserted < toWrite.length ? ` (${toWrite.length - inserted} already there)` : ""}. Committing.`,
      );
    } else {
      console.log("\nDry run finished. Nothing was changed.");
    }
  });
} catch (e) {
  console.error(`FAIL: ${(e as Error).message}`);
  process.exitCode = 1;
} finally {
  await sql.end();
}
