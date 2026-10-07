import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { analyticsCacheKey, RANGES } from "../src/lib/admin/analytics-math";

// Counted readers for the Analytics spec. Every e2e account is @e2e.test or an admin, and both are left out of
// every number, so without these the page only ever renders its empty states. Three readers on a non-test domain
// (example.test) with answers on several days, a mock, a share card with an invitee, sources and a long report.
// Not a spec file, so importing it never registers tests. `clear()` deletes them (rows cascade from auth.users).

const LONG_REPORT = `The grading spinner never stops on a long answer ${"x".repeat(160)}`;

export async function seedReaders(): Promise<{ clear: () => Promise<void> }> {
  const url = process.env.DATABASE_URL;
  if (!url || !/@(127\.0\.0\.1|localhost)[:/]/.test(url)) throw new Error("the analytics seed runs only against a local database");
  const sql = postgres(url, { max: 1, prepare: false });
  const ids = [randomUUID(), randomUUID(), randomUUID()] as const;
  const code = ids[0].replace(/[^a-z0-9]/g, "").slice(0, 8);
  const clear = async () => {
    await sql`delete from auth.users where id in ${sql(ids)}`;
    await sql.end();
  };
  try {
    const cards = (await sql`select id from public.cards order by id limit 6`).map((r) => r.id as string);
    const readers = [
      { id: ids[0], ago: 10, source: "linkedin", campaign: null },
      { id: ids[1], ago: 4, source: "share", campaign: code },
      { id: ids[2], ago: 2, source: "direct", campaign: null },
    ];
    for (const r of readers) {
      await sql`insert into auth.users (id, email, aud, role)
                values (${r.id}, ${`analytics-reader-${r.id.slice(0, 8)}@example.test`}, 'authenticated', 'authenticated')`;
      await sql`update public.profiles set timezone = 'UTC', created_at = now() - make_interval(days => ${r.ago}),
                setup_done_at = now() - make_interval(days => ${r.ago}), signup_source = ${r.source}, signup_campaign = ${r.campaign}
                where user_id = ${r.id}`;
      await sql`insert into public.campaigns (user_id, start_date, length_days, status, templates)
                values (${r.id}, (now() - make_interval(days => ${r.ago}))::date, 90, 'active', '{}'::jsonb)`;
      // Everyone answers on each of the last three days, so a day has three people and the line is a line.
      for (let d = 0; d <= Math.min(r.ago, 3); d++)
        for (let k = 0; k < 3; k++)
          await sql`insert into public.card_reviews (user_id, card_id, score, outcome, graded_by, created_at)
                    values (${r.id}, ${cards[(d + k) % cards.length]!}, 1, ${k === 2 ? "wrong" : "correct"}, 'pure',
                            now() - make_interval(days => ${d}, mins => ${k * 5}))`;
    }
    await sql`insert into public.mocks (user_id, type, started_at) values (${ids[0]}, 'design', now() - interval '1 day')`;
    await sql`insert into public.share_codes (user_id, code, shared_count, views) values (${ids[0]}, ${code}, 2, 1)`;
    await sql`insert into public.problem_reports (user_id, message) values (${ids[0]}, ${LONG_REPORT})`;
  } catch (e) {
    await clear();
    throw e;
  }
  return { clear };
}

/** Drops the cached dashboards an e2e admin (time zone UTC, no launch date) would read, so the page sees the seed. */
export async function dropAnalyticsCache() {
  const base = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!base || !token) return;
  for (const range of RANGES)
    await fetch(base, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(["DEL", analyticsCacheKey(range, null, "UTC")]),
    });
}
