// Runs every Analytics query against the migrated schema, so a renamed column fails here
// and not on the live /admin/analytics page. It makes one throwaway person (an example.test
// address, so it is counted) who signs up three days ago and does a mock the next day, checks
// the numbers that person must move, then deletes them. Run with `bun run check:analytics`.

import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { computeAnalytics } from "@/lib/admin/analytics";
import { RANGES } from "@/lib/admin/analytics-math";

const failures: string[] = [];
function expect(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures.push(name);
}

const id = randomUUID();
try {
  await db.execute(
    sql`insert into auth.users (id, email, aud, role) values (${id}, ${`analytics-${id.slice(0, 8)}@example.test`}, 'authenticated', 'authenticated')`,
  );
  await db.execute(
    sql`update public.profiles set timezone = 'Pacific/Auckland', created_at = now() - interval '3 days', signup_source = 'linkedin' where user_id = ${id}`,
  );
  await db.execute(sql`insert into public.mocks (user_id, type, started_at) values (${id}, 'design', now() - interval '2 days')`);
  const [card] = (await db.execute(sql`select id from public.cards limit 1`)) as unknown as { id: string }[];
  if (card) {
    await db.execute(
      sql`insert into public.card_reviews (user_id, card_id, score, outcome, graded_by, created_at) values (${id}, ${card.id}, 1, 'correct', 'pure', now() - interval '3 days' + interval '1 hour')`,
    );
  }

  for (const range of RANGES) {
    const a = await computeAnalytics(range, new Date());
    expect(
      `range ${range}: one value per day`,
      a.growth.signups.length === range && a.engagement.coach.length === range && a.cost.daily.length === range,
    );
    expect(
      `range ${range}: the new signup is counted`,
      a.growth.total >= 1 && a.growth.bySource.find((s) => s.group === "linkedin")!.n >= 1,
    );
    expect(
      `range ${range}: the mock made them active on day 1`,
      a.retention.cohorts.some((c) => c.d1 >= 1),
    );
    expect(`range ${range}: activity is counted`, a.actives.mau >= 1 && a.actives.daily.some((d) => d.n >= 1));
    if (card) expect(`range ${range}: the answer activates them`, a.activation.activated.part >= 1 && a.activation.medianMinutes !== null);
    expect(`range ${range}: cost fields are numbers`, Number.isFinite(a.cost.total) && Number.isFinite(a.cost.lifetime));
  }
} catch (e) {
  console.error(`FAIL: ${(e as Error).message}`);
  failures.push("run");
} finally {
  await db.execute(sql`delete from auth.users where id = ${id}`);
}

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log("\nAll analytics checks passed");
process.exit(0);
