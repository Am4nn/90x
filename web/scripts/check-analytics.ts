// Runs every Analytics query against the migrated schema, so a renamed column fails here
// and not on the live /admin/analytics page. It makes one throwaway person (an example.test
// address, so it is counted) who signs up three days ago and does a mock the next day, checks
// the numbers that person must move, then deletes them. Run with `bun run check:analytics`.

import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { computeAnalytics, launchGateCounts } from "@/lib/admin/analytics";
import { GATE_DAYS, RANGES } from "@/lib/admin/analytics-math";
import { addDays } from "@/lib/tracker/dates";

// This check inserts throwaway users (one a fake week-2 returner): never let it near a real database.
// Imports only build the lazy client, so nothing has connected yet.
for (const url of [process.env.DATABASE_URL, process.env.DIRECT_URL]) {
  if (!url || !/@(127\.0\.0\.1|localhost)[:/]/.test(url)) {
    console.error("check-analytics runs only against a local database (127.0.0.1 or localhost).");
    process.exit(1);
  }
}

const failures: string[] = [];
function expect(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures.push(name);
}

const id = randomUUID();
const returnerId = randomUUID();
const edgeId = randomUUID();
const lateId = randomUUID();
const day6Id = randomUUID();
const day7Id = randomUUID();

const makeUser = (uid: string) =>
  db.execute(
    sql`insert into auth.users (id, email, aud, role) values (${uid}, ${`analytics-${uid.slice(0, 8)}@example.test`}, 'authenticated', 'authenticated')`,
  );
/** Noon UTC on a date, as a timestamp. */
const noon = (d: string) => sql`((${d}::date + time '12:00') at time zone 'utc')`;
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

  // A second throwaway person who signed up 12 days ago and did a mock yesterday: day 11, so a week-2 returner.
  await makeUser(returnerId);
  await db.execute(sql`update public.profiles set timezone = 'UTC', created_at = now() - interval '12 days' where user_id = ${returnerId}`);
  await db.execute(sql`insert into public.mocks (user_id, type, started_at) values (${returnerId}, 'design', now() - interval '1 day')`);

  const today = new Date().toISOString().slice(0, 10);
  const before = await launchGateCounts(addDays(today, -15));
  const after = await launchGateCounts(addDays(today, -5));
  expect("gate: a signup on or after the launch date is counted", before.signups >= 2 && before.returners >= 1);
  expect("gate: launching after they signed up leaves the week-2 returner out", before.returners - after.returners >= 1);
  expect("gate: launching after they signed up leaves them out", before.signups - after.signups >= 1);
  expect("gate: the window starts at the launch date", (await launchGateCounts(addDays(today, 1))).returners === 0);
  expect(
    "gate: counts are whole numbers",
    [before.signups, before.activated, before.returners].every((n) => Number.isInteger(n) && n >= 0),
  );

  // The first throwaway person signed up 3 days ago and acted on day 1 only: counted as a signup, never a returner.
  const near = await launchGateCounts(addDays(today, -4));
  await db.execute(sql`update public.profiles set created_at = now() - interval '60 days' where user_id = ${id}`);
  const near2 = await launchGateCounts(addDays(today, -4));
  expect("gate: the first throwaway person (day 1 only) is a signup", near.signups - near2.signups === 1);
  expect("gate: the first throwaway person (day 1 only) is not a week-2 returner", near.returners === near2.returners);

  // The window is [launch, launch + 30 days): nothing on or after the end day moves a closed gate.
  const launch = addDays(today, -40);
  const end = addDays(launch, GATE_DAYS);
  const base = await launchGateCounts(launch);
  await makeUser(lateId);
  await db.execute(sql`update public.profiles set timezone = 'UTC', created_at = ${noon(end)} where user_id = ${lateId}`);
  const withLate = await launchGateCounts(launch);
  expect("gate: a signup exactly at launch + 30 days does not count", withLate.signups === base.signups);
  await makeUser(edgeId);
  await db.execute(sql`update public.profiles set timezone = 'UTC', created_at = ${noon(addDays(launch, 1))} where user_id = ${edgeId}`);
  await db.execute(sql`insert into public.mocks (user_id, type, started_at) values (${edgeId}, 'design', ${noon(end)})`);
  const withEdge = await launchGateCounts(launch);
  expect("gate: a signup the day after launch counts", withEdge.signups === base.signups + 1);
  expect("gate: an action exactly at launch + 30 days does not count", withEdge.returners === base.returners);
  await db.execute(sql`insert into public.mocks (user_id, type, started_at) values (${edgeId}, 'design', ${noon(addDays(end, -1))})`);
  expect("gate: an action the day before launch + 30 days counts", (await launchGateCounts(launch)).returners === base.returners + 1);
  // The +7 rule: active only on signup day + 6 is not a week-2 returner, active on signup day + 7 is.
  const plusLaunch = addDays(today, -20);
  const plusBase = await launchGateCounts(plusLaunch);
  const signUpAndAct = async (uid: string, offset: number) => {
    await makeUser(uid);
    await db.execute(sql`update public.profiles set timezone = 'UTC', created_at = ${noon(addDays(plusLaunch, 1))} where user_id = ${uid}`);
    await db.execute(
      sql`insert into public.mocks (user_id, type, started_at) values (${uid}, 'design', ${noon(addDays(plusLaunch, 1 + offset))})`,
    );
  };
  await signUpAndAct(day6Id, 6);
  const plus6 = await launchGateCounts(plusLaunch);
  expect(
    "gate: active only on signup day + 6 is not a returner",
    plus6.returners === plusBase.returners && plus6.signups === plusBase.signups + 1,
  );
  await signUpAndAct(day7Id, 7);
  const plus7 = await launchGateCounts(plusLaunch);
  expect("gate: active on signup day + 7 is a returner", plus7.returners === plus6.returners + 1);
} catch (e) {
  console.error(`FAIL: ${(e as Error).message}`);
  failures.push("run");
} finally {
  for (const uid of [id, returnerId, edgeId, lateId, day6Id, day7Id]) await db.execute(sql`delete from auth.users where id = ${uid}`);
}

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log("\nAll analytics checks passed");
process.exit(0);
