// Runs every Analytics query against the migrated schema, so a renamed column fails here
// and not on the live /admin/analytics page. It makes throwaway people (example.test
// addresses, so they are counted, plus an admin and an @e2e.test account, who must not be),
// checks the numbers each one must move or leave alone, then deletes them.
// Run with `bun run check:analytics`.

import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { type Analytics, computeAnalytics, launchGateCounts, readDemo } from "@/lib/admin/analytics";
import { demoFunnel, GATE_DAYS, maskEmail, RANGES } from "@/lib/admin/analytics-math";
import { addDays, localDate } from "@/lib/tracker/dates";
import { markOpened } from "@/lib/tracker/service";

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
const adminId = randomUUID();
const testId = randomUUID();
const inviteeId = randomUUID();
const adminInviteeId = randomUUID();
const usageIds: string[] = [];

const emailOf = (uid: string) => `analytics-${uid.slice(0, 8)}@example.test`;
const makeUser = (uid: string, email = emailOf(uid)) =>
  db.execute(sql`insert into auth.users (id, email, aud, role) values (${uid}, ${email}, 'authenticated', 'authenticated')`);
/** A share code for a throwaway person: 8 lowercase letters or digits from their id. */
const codeOf = (uid: string) => uid.replace(/[^a-z0-9]/g, "").slice(0, 8);
const near = (x: number, y: number) => Math.abs(x - y) < 1e-9;
const sumOf = (xs: { n: number }[]) => xs.reduce((s, d) => s + d.n, 0);
const spentToday = (a: Analytics) => a.cost.daily.at(-1)!;
const usage = async (uid: string, usd: number) => {
  const [u] = (await db.execute(
    sql`insert into public.ai_usage (user_id, route, model, cost_usd) values (${uid}, 'check', 'check', ${usd}) returning id`,
  )) as unknown as { id: string }[];
  usageIds.push(u!.id);
};
/** The numbers a person who must not count would move: compared before and after their activity. */
const footprint = (a: Analytics) =>
  JSON.stringify([
    a.here.signups,
    a.here.today,
    a.activeUsers,
    sumOf(a.actives),
    sumOf(a.actions.mocks),
    sumOf(a.actions.cards),
    a.funnel.signedUp,
    a.reports.total,
    a.reports.open,
    a.share.opened,
    a.people.length,
    spentToday(a).readers,
  ]);

/** Noon UTC on a date, as a timestamp. */
const noon = (d: string) => sql`((${d}::date + time '12:00') at time zone 'utc')`;

// The demo section is counted in Postgres. Its JS fold (demoFunnel) is the oracle: one transaction empties
// try_events, writes visits that cover every rule (repeats, first answers by time then id, unknown cards,
// bad buckets, rows before the range), compares the two and rolls back, so no row is left behind.
type Seed = { visit: string; kind: string; data: unknown; at: number };
/** A visit id the table accepts (16+ lowercase letters or digits), easy to find if one were ever left. */
const v = (name: string) => `parity${name}`.padEnd(16, "0");
async function checkDemoParity() {
  const from = addDays(new Date().toISOString().slice(0, 10), -29);
  const IN = 1000; // seconds after the range starts
  const OUT = -60; // a minute before it
  const seeds: Seed[] = [
    // a: two sd answers (the first, wrong, counts), a dsa answer, a listen without its end, a leave.
    { visit: v("a"), kind: "view", data: {}, at: IN },
    { visit: v("a"), kind: "answer", data: { card: "sd", option: 0, correct: false }, at: IN + 10 },
    { visit: v("a"), kind: "answer", data: { card: "sd", option: 1, correct: true }, at: IN + 20 },
    { visit: v("a"), kind: "answer", data: { card: "dsa", option: 2, correct: true }, at: IN + 30 },
    { visit: v("a"), kind: "listen_start", data: {}, at: IN + 40 },
    { visit: v("a"), kind: "leave", data: { seconds: "0-10", step: "listened" }, at: IN + 50 },
    // b: all three cards, a finished listen, a sign-in click.
    { visit: v("b"), kind: "answer", data: { card: "sd", option: 1, correct: true }, at: IN },
    { visit: v("b"), kind: "answer", data: { card: "dsa", option: 0, correct: false }, at: IN + 1 },
    { visit: v("b"), kind: "answer", data: { card: "sql", option: 3, correct: true }, at: IN + 2 },
    { visit: v("b"), kind: "listen_start", data: {}, at: IN + 3 },
    { visit: v("b"), kind: "listen_95", data: {}, at: IN + 4 },
    { visit: v("b"), kind: "signin_click", data: { spot: "try" }, at: IN + 5 },
    { visit: v("b"), kind: "leave", data: { seconds: "300+", step: "signed_in" }, at: IN + 6 },
    // c: only a view.
    { visit: v("c"), kind: "view", data: {}, at: IN },
    // d: malformed answers (unknown card, no card, JSON null) and leaves with no or a bad bucket.
    { visit: v("d"), kind: "answer", data: { card: "nope", option: 0, correct: true }, at: IN },
    { visit: v("d"), kind: "answer", data: {}, at: IN + 1 },
    { visit: v("d"), kind: "answer", data: null, at: IN + 2 },
    { visit: v("d"), kind: "answer", data: { card: ["sd"], correct: true }, at: IN + 3 },
    { visit: v("d"), kind: "leave", data: { seconds: "bogus" }, at: IN + 4 },
    { visit: v("d"), kind: "leave", data: {}, at: IN + 5 },
    { visit: v("d"), kind: "leave", data: { seconds: 45 }, at: IN + 6 },
    { visit: v("d"), kind: "leave", data: null, at: IN + 7 },
    // e: a listen started and paused, never finished.
    { visit: v("e"), kind: "listen_start", data: {}, at: IN },
    { visit: v("e"), kind: "listen_pause", data: { at: "10-30" }, at: IN + 1 },
    { visit: v("e"), kind: "leave", data: { seconds: "10-30", step: "listened" }, at: IN + 2 },
    // f: written later but timed earlier, so the wrong sql answer is the first; a tab.
    { visit: v("f"), kind: "tab", data: { tab: "sd" }, at: IN },
    { visit: v("f"), kind: "answer", data: { card: "sql", option: 1, correct: true }, at: IN + 50 },
    { visit: v("f"), kind: "answer", data: { card: "sql", option: 2, correct: false }, at: IN + 40 },
    // g: only before the range, so not a visit at all.
    { visit: v("g"), kind: "view", data: {}, at: OUT },
    { visit: v("g"), kind: "answer", data: { card: "sd", option: 1, correct: true }, at: OUT },
    { visit: v("g"), kind: "leave", data: { seconds: "60-120", step: "answered" }, at: OUT },
    // h: a sign-in click before the range and a view inside it: only the view counts.
    { visit: v("h"), kind: "signin_click", data: { spot: "top" }, at: OUT },
    { visit: v("h"), kind: "view", data: {}, at: IN },
    // i, j, k, n: the other buckets (k leaves twice); 8 known buckets in all, so the median is a midpoint average.
    { visit: v("i"), kind: "leave", data: { seconds: "30-60", step: "viewed" }, at: IN },
    { visit: v("j"), kind: "leave", data: { seconds: "60-120", step: "viewed" }, at: IN },
    { visit: v("k"), kind: "leave", data: { seconds: "120-300", step: "viewed" }, at: IN },
    { visit: v("k"), kind: "leave", data: { seconds: "0-10", step: "viewed" }, at: IN + 1 },
    { visit: v("n"), kind: "leave", data: { seconds: "300+", step: "viewed" }, at: IN },
    // l: "correct" as a string is not a right answer.
    { visit: v("l"), kind: "answer", data: { card: "dsa", option: 1, correct: "true" }, at: IN },
    // m: two sd answers at the same moment: the first written counts.
    { visit: v("m"), kind: "answer", data: { card: "sd", option: 1, correct: true }, at: IN },
    { visit: v("m"), kind: "answer", data: { card: "sd", option: 2, correct: false }, at: IN },
    // o: "correct" as null or 1 is not a right answer; both cards still count as answered.
    { visit: v("o"), kind: "answer", data: { card: "sd", option: 0, correct: null }, at: IN },
    { visit: v("o"), kind: "answer", data: { card: "dsa", option: 0, correct: 1 }, at: IN + 1 },
    // p: a card sent as a number, and data that is a bare JSON string, not an object.
    { visit: v("p"), kind: "answer", data: { card: 5, correct: true }, at: IN },
    { visit: v("p"), kind: "answer", data: "sd", at: IN + 1 },
  ];
  const start = new Date(`${from}T00:00:00Z`).getTime();
  // The oracle's input: the rows in range, in created_at then id (written) order, as Postgres sorts them.
  const inRange = seeds
    .map((s, i) => ({ ...s, i }))
    .filter((s) => s.at >= 0)
    .toSorted((x, y) => x.at - y.at || x.i - y.i)
    .map(({ visit, kind, data }) => ({ visit, kind, data }));
  const want = demoFunnel(inRange);

  const rolledBack = new Error("parity: roll back");
  let got: Awaited<ReturnType<typeof readDemo>> | undefined;
  let empty: Awaited<ReturnType<typeof readDemo>> | undefined;
  try {
    await db.transaction(async (tx) => {
      // The range starts at a UTC midnight; a session ahead of UTC would pull the "before" rows in.
      await tx.execute(sql`set local timezone = 'UTC'`);
      await tx.execute(sql`delete from public.try_events`);
      for (const s of seeds) {
        const at = new Date(start + s.at * 1000).toISOString();
        await tx.execute(
          sql`insert into public.try_events (visit, kind, data, created_at) values (${s.visit}, ${s.kind}, ${JSON.stringify(s.data)}::jsonb, ${at}::timestamptz)`,
        );
      }
      got = await readDemo(from, tx);
      // A range with no rows at all: the real SQL, not a stub, must give the fold's empty answer.
      empty = await readDemo(addDays(from, 365), tx);
      throw rolledBack;
    });
  } catch (e) {
    if (e !== rolledBack) throw e;
  }
  const [{ n: left } = { n: -1 }] = (await db.execute(
    sql`select count(*)::int as n from public.try_events where visit like 'parity%'`,
  )) as unknown as { n: number }[];
  expect("demo: no seeded row is left behind", left === 0, `${left}`);
  expect(
    "demo: the seed covers every rule",
    want.visits === 15 && want.answered.join() === "6,3,1" && want.medianSeconds === 67.5 && want.listens.started === 3,
    JSON.stringify(want),
  );
  expect("demo: Postgres counts what the JS fold counts", isDeepStrictEqual(got, want), JSON.stringify(got));
  expect("demo: an empty range counts nothing, as the fold does", isDeepStrictEqual(empty, demoFunnel([])), JSON.stringify(empty));
}

try {
  await checkDemoParity();
  await makeUser(id);
  await db.execute(
    sql`update public.profiles set timezone = 'Pacific/Auckland', created_at = now() - interval '3 days', signup_source = 'linkedin',
        setup_done_at = now() - interval '3 days' where user_id = ${id}`,
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
      a.actives.length === range &&
        a.here.signupsDaily.length === range &&
        a.cost.daily.length === range &&
        Object.values(a.actions).every((d) => d.length === range),
    );
    expect(`range ${range}: the payload carries its version and range`, a.version >= 2 && a.range === range);
    expect(
      `range ${range}: the new signup is counted`,
      a.here.signups >= 1 && a.sources.find((s) => s.group === "linkedin")!.n >= 1 && a.funnel.signedUp >= 1 && a.funnel.setup >= 1,
    );
    expect(`range ${range}: activity is counted`, a.activeUsers >= 1 && a.actives.some((d) => d.n >= 1) && sumOf(a.actions.mocks) >= 1);
    expect(`range ${range}: eight weeks of weekly actives`, a.here.weekly.length === 8 && a.here.wau === a.here.weekly[7]);
    expect(`range ${range}: their sign-up week has a cohort row`, a.cohorts.some((c) => c.size >= 1) && a.cohorts.length <= 6);
    if (card) {
      expect(`range ${range}: the answer is a card answered, in an area`, sumOf(a.actions.cards) >= 1 && a.areas.length >= 1);
      expect(`range ${range}: the answer moves the funnel`, a.funnel.answered >= 1);
    }
    expect(
      `range ${range}: cost fields are numbers`,
      Number.isFinite(a.cost.last30) && Number.isFinite(a.cost.lifetime) && a.cost.dailyCap > 0,
    );
    expect(
      `range ${range}: people are listed with masked emails only`,
      a.people.length <= 20 && a.people.some((p) => p.who === maskEmail(emailOf(id))) && !JSON.stringify(a).includes(emailOf(id)),
    );
  }

  const far = await computeAnalytics(7, new Date(), undefined, "Pacific/Kiritimati");
  expect("today is the viewer's own calendar day", far.today === localDate("Pacific/Kiritimati") && far.actives.at(-1)!.day === far.today);
  expect("AI spend stays on UTC days whatever the viewer's zone", far.cost.daily.at(-1)!.day === localDate("UTC"));

  // Admins and test accounts never count: one of each signs up and does everything, and nothing moves.
  const before = footprint(await computeAnalytics(30, new Date()));
  await makeUser(adminId);
  await db.execute(
    sql`insert into public.user_approvals (user_id, status, is_admin, decided_at) values (${adminId}, 'approved', true, now())
        on conflict (user_id) do update set status = 'approved', is_admin = true, decided_at = now()`,
  );
  await makeUser(testId, `analytics-${testId.slice(0, 8)}@e2e.test`);
  for (const uid of [adminId, testId]) {
    await db.execute(sql`update public.profiles set timezone = 'UTC', setup_done_at = now() where user_id = ${uid}`);
    await db.execute(sql`insert into public.mocks (user_id, type, started_at) values (${uid}, 'design', now())`);
    await db.execute(sql`insert into public.problem_reports (user_id, message) values (${uid}, 'analytics check')`);
    await db.execute(sql`insert into public.share_codes (user_id, code, shared_count, views) values (${uid}, ${codeOf(uid)}, 5, 5)`);
    await usage(uid, 0.25);
    if (card)
      await db.execute(
        sql`insert into public.card_reviews (user_id, card_id, score, outcome, graded_by) values (${uid}, ${card.id}, 1, 'correct', 'pure')`,
      );
  }
  const after = await computeAnalytics(30, new Date());
  expect("an admin and a test account move no number", footprint(after) === before, `${before} -> ${footprint(after)}`);
  expect("their AI spend still shows, as system jobs", spentToday(after).builds >= 0.5 - 1e-9);
  // A reader who joins through the admin's invite link is a counted sign-up, but the admin is never listed as a sharer.
  await makeUser(adminInviteeId);
  await db.execute(
    sql`update public.profiles set timezone = 'UTC', created_at = now() - interval '1 hour', signup_source = 'share', signup_campaign = ${codeOf(adminId)}
        where user_id = ${adminInviteeId}`,
  );
  const viaAdmin = await computeAnalytics(30, new Date());
  expect(
    "an invite from an admin counts the sign-up but never lists the admin",
    viaAdmin.share.invites === after.share.invites + 1 && !viaAdmin.share.sharers.some((s) => s.who === maskEmail(emailOf(adminId))),
  );

  // Counted people: AI spend is a reader's, a report is open, the share card counters and an invite add up.
  const base = await computeAnalytics(30, new Date());
  await usage(id, 0.5);
  await db.execute(sql`insert into public.problem_reports (user_id, message) values (${id}, 'analytics check')`);
  await db.execute(sql`insert into public.share_codes (user_id, code, shared_count, views) values (${id}, ${codeOf(id)}, 2, 3)`);
  await makeUser(inviteeId);
  await db.execute(
    sql`update public.profiles set timezone = 'UTC', created_at = now() - interval '1 hour', signup_source = 'share', signup_campaign = ${codeOf(id)}
        where user_id = ${inviteeId}`,
  );
  const [topic] = (await db.execute(sql`select slug from public.topics limit 1`)) as unknown as { slug: string }[];
  // The invitee keeps UTC, so the open lands on today's bar (the first person is in Auckland, ahead of it).
  const opens: boolean[] = [];
  if (topic) for (let i = 0; i < 3; i++) opens.push(await markOpened(inviteeId, topic.slug));
  const moved = await computeAnalytics(30, new Date());
  expect("a reader's AI spend is counted as readers", near(spentToday(moved).readers - spentToday(base).readers, 0.5));
  expect("a report is counted and open", moved.reports.total === base.reports.total + 1 && moved.reports.open === base.reports.open + 1);
  expect("the latest report comes first", moved.reports.latest[0]?.message === "analytics check" && moved.reports.latest.length <= 3);
  expect("a share card made in range is counted", moved.share.opened === base.share.opened + 1);
  expect("times shared and card views add up", moved.share.shared === base.share.shared + 2 && moved.share.views === base.share.views + 3);
  expect("an invite sign-up counts", moved.share.invites === base.share.invites + 1);
  expect(
    "the sharer is listed, masked",
    moved.share.sharers.some((s) => s.who === maskEmail(emailOf(id)) && s.n === 1),
  );
  if (topic) {
    expect("a lesson's first open counts once", sumOf(moved.actions.lessons) === sumOf(base.actions.lessons) + 1);
    expect("opening it twice more counts two re-opens", moved.reopens === base.reopens + 2);
    const [o] = (await db.execute(
      sql`select open_count, opened_at <= last_opened_at as kept from public.topic_opens where user_id = ${inviteeId} and topic_slug = ${topic.slug}`,
    )) as unknown as { open_count: number; kept: boolean }[];
    expect("re-opens keep the first open time", Number(o?.open_count) === 3 && o?.kept === true);
    expect("markOpened says first open once, then re-open", JSON.stringify(opens) === "[true,false,false]");
    // A row with an absurd counter (written by hand, or by an old client) skews a number but never breaks the page.
    await db.execute(
      sql`update public.topic_opens set open_count = 2147483647 where user_id = ${inviteeId} and topic_slug = ${topic.slug}`,
    );
    await db.execute(sql`update public.share_codes set views = 2147483647, shared_count = 2147483647 where user_id = ${id}`);
    const huge = await computeAnalytics(30, new Date());
    expect("huge counters do not overflow the queries", huge.reopens >= 2147483646 && huge.share.views >= 2147483647);
  }

  // A second throwaway person who signed up 12 days ago and did a mock yesterday: day 11, so a week-2 returner.
  await makeUser(returnerId);
  await db.execute(sql`update public.profiles set timezone = 'UTC', created_at = now() - interval '12 days' where user_id = ${returnerId}`);
  await db.execute(sql`insert into public.mocks (user_id, type, started_at) values (${returnerId}, 'design', now() - interval '1 day')`);

  const returned = await computeAnalytics(30, new Date());
  expect(
    "a person back 11 days after signing up comes back in the funnel",
    returned.funnel.cameBack >= 1 && returned.funnel.oldEnough >= returned.funnel.cameBack,
  );

  const today = new Date().toISOString().slice(0, 10);
  const gateBefore = await launchGateCounts(addDays(today, -15));
  const gateAfter = await launchGateCounts(addDays(today, -5));
  expect("gate: a signup on or after the launch date is counted", gateBefore.signups >= 2 && gateBefore.returners >= 1);
  expect("gate: launching after they signed up leaves the week-2 returner out", gateBefore.returners - gateAfter.returners >= 1);
  expect("gate: launching after they signed up leaves them out", gateBefore.signups - gateAfter.signups >= 1);
  expect("gate: the window starts at the launch date", (await launchGateCounts(addDays(today, 1))).returners === 0);
  expect(
    "gate: counts are whole numbers",
    [gateBefore.signups, gateBefore.activated, gateBefore.returners].every((n) => Number.isInteger(n) && n >= 0),
  );

  // The first throwaway person signed up 3 days ago and acted on day 1 only: counted as a signup, never a returner.
  const near1 = await launchGateCounts(addDays(today, -4));
  await db.execute(sql`update public.profiles set created_at = now() - interval '60 days' where user_id = ${id}`);
  const near2 = await launchGateCounts(addDays(today, -4));
  expect("gate: the first throwaway person (day 1 only) is a signup", near1.signups - near2.signups === 1);
  expect("gate: the first throwaway person (day 1 only) is not a week-2 returner", near1.returners === near2.returners);

  // The window is [launch, launch + 30 days): nothing on or after the end day moves a closed gate.
  const launch = addDays(today, -40);
  const end = addDays(launch, GATE_DAYS);
  const gateBase = await launchGateCounts(launch);
  await makeUser(lateId);
  await db.execute(sql`update public.profiles set timezone = 'UTC', created_at = ${noon(end)} where user_id = ${lateId}`);
  const withLate = await launchGateCounts(launch);
  expect("gate: a signup exactly at launch + 30 days does not count", withLate.signups === gateBase.signups);
  await makeUser(edgeId);
  await db.execute(sql`update public.profiles set timezone = 'UTC', created_at = ${noon(addDays(launch, 1))} where user_id = ${edgeId}`);
  await db.execute(sql`insert into public.mocks (user_id, type, started_at) values (${edgeId}, 'design', ${noon(end)})`);
  const withEdge = await launchGateCounts(launch);
  expect("gate: a signup the day after launch counts", withEdge.signups === gateBase.signups + 1);
  expect("gate: an action exactly at launch + 30 days does not count", withEdge.returners === gateBase.returners);
  await db.execute(sql`insert into public.mocks (user_id, type, started_at) values (${edgeId}, 'design', ${noon(addDays(end, -1))})`);
  expect("gate: an action the day before launch + 30 days counts", (await launchGateCounts(launch)).returners === gateBase.returners + 1);
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
  console.error(`FAIL: ${(e as Error).message}`, (e as Error).cause ?? "");
  failures.push("run");
} finally {
  for (const uid of [id, returnerId, edgeId, lateId, day6Id, day7Id, adminId, testId, inviteeId, adminInviteeId])
    await db.execute(sql`delete from auth.users where id = ${uid}`);
  for (const u of usageIds) await db.execute(sql`delete from public.ai_usage where id = ${u}`);
}

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log("\nAll analytics checks passed");
process.exit(0);
