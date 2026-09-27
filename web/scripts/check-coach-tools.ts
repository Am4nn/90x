// Checks that the coach's read tools and thread/memory helpers only ever see
// the signed-in user's private rows. Two users get
// private data marked SECRET; every lookup for the first user must come back
// without the second user's rows. Everything runs in one transaction that is
// always rolled back. Run with `bun run check:coach-tools`.

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { coachMemory, coachThreads, missions } from "@/db/schema";
import { deleteFact, editFact } from "@/lib/coach/memory-edit";
import { ensureThread, getThread, listThreads, threadMessages } from "@/lib/coach/threads";
import { summarizeFriends } from "@/lib/coach/tool-summaries";
import {
  activeTemplates,
  findCardsData,
  findProblemsData,
  friendSummaryData,
  planData,
  progressData,
  recentActivityData,
  weakSpotsData,
} from "@/lib/coach/tools-data";
import { localDate } from "@/lib/tracker/dates";
import { snapshotReadiness } from "@/lib/tracker/service";

const failures: string[] = [];
function expect(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures.push(name);
}

const ROLLBACK = new Error("rollback");
const me = "00000000-0000-4000-8000-0000000000c1";
const friend = "00000000-0000-4000-8000-0000000000c2";
const now = new Date();
const today = localDate("Asia/Kolkata", now);
const SECRET = "SECRET";
const week = (slots: object) => JSON.stringify(Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [d, slots])));
const leaks = (value: unknown) => JSON.stringify(value).includes(SECRET) || JSON.stringify(value).includes(friend);

try {
  await db.transaction(async (tx) => {
    for (const [id, name] of [
      [me, "Me Tester"],
      [friend, "Friend Tester"],
    ] as const) {
      await tx.execute(
        sql`insert into auth.users (id, email, aud, role) values (${id}, ${`coach-${id.slice(-2)}@example.test`}, 'authenticated', 'authenticated')`,
      );
      await tx.execute(sql`update public.user_approvals set status = 'approved', decided_at = now() where user_id = ${id}`);
      await tx.execute(
        sql`update public.profiles set name = ${name}, timezone = 'Asia/Kolkata', setup_done_at = now() where user_id = ${id}`,
      );
    }
    await tx.execute(
      sql`insert into public.sources (id, name, domain, role) values ('ct-src', 'Coach test', 'dsa', 'cards') on conflict do nothing`,
    );
    await tx.execute(sql`insert into public.topics (slug, domain, name, importance, sort) values
      ('ct-pattern', 'dsa', 'Coach test pattern', 1, 999), ('ct-sd', 'system_design', 'Coach test topic', 1, 999)`);
    for (let i = 1; i <= 3; i++) {
      await tx.execute(sql`insert into public.problems (slug, kind, title, difficulty, pattern_slug, importance, statement_md, source_id)
        values (${`ct-p${i}`}, 'leetcode', ${`CT ${i}`}, 'Medium', 'ct-pattern', ${1 - i / 100}, 'statement', 'ct-src')`);
    }
    const [card1, card2] = (
      await tx.execute<{ id: string }>(sql`
        insert into public.cards (topic_slug, format, prompt_md, answer_md, status) values
          ('ct-sd', 'typed', 'first card', 'a', 'live'), ('ct-sd', 'typed', 'second card', 'a', 'live')
        returning id`)
    ).map((r) => r.id);
    if (!card1 || !card2) throw new Error("cards not created");

    const mine = { new_problem: 1, review: 0, topic: 1, cards: 0 };
    const theirs = { new_problem: 3, review: 2, topic: 0, cards: 2 };
    await tx.execute(sql`insert into public.campaigns (user_id, start_date, length_days, templates) values
      (${me}, ${today}, 30, ${week(mine)}::jsonb), (${friend}, ${today}, 60, ${week(theirs)}::jsonb)`);
    await tx.execute(sql`insert into public.readiness_snapshots (user_id, date, overall, per_area) values
      (${me}, ${today}, 77, '{}'::jsonb), (${friend}, ${today}, 13, '{}'::jsonb)`);

    // My activity: one solve, one correct card, one mock.
    await tx.execute(sql`insert into public.checkins (user_id, problem_slug, result, minutes) values (${me}, 'ct-p2', 'solved', 20)`);
    await tx.execute(sql`insert into public.card_reviews (user_id, card_id, answer, score, outcome, graded_by)
      values (${me}, ${card2}, 'x', 1, 'correct', 'match')`);
    await tx.execute(sql`insert into public.mocks (user_id, type, topic, status, score) values (${me}, 'design', 'My mock', 'done', 80)`);

    // The friend's activity, with private parts marked SECRET.
    const [friendCheckin] = await tx.execute<{ id: string }>(
      sql`insert into public.checkins (user_id, problem_slug, result, minutes) values (${friend}, 'ct-p1', 'failed', 45) returning id`,
    );
    await tx.execute(
      sql`insert into public.checkin_notes (checkin_id, user_id, note) values (${friendCheckin?.id ?? null}, ${friend}, 'SECRET note')`,
    );
    await tx.execute(sql`insert into public.card_reviews (user_id, card_id, answer, score, outcome, graded_by)
      values (${friend}, ${card1}, 'SECRET answer', 0, 'wrong', 'match')`);
    await tx.execute(
      sql`insert into public.mocks (user_id, type, topic, status, score) values (${friend}, 'behavioral', 'Conflict', 'done', 40)`,
    );
    const [friendMock] = await tx.execute<{ id: string }>(sql`select id from public.mocks where user_id = ${friend}`);
    await tx.execute(
      sql`insert into public.mock_details (mock_id, user_id, prompt, feedback_md) values (${friendMock?.id ?? null}, ${friend}, 'SECRET prompt', 'SECRET feedback')`,
    );
    const [friendFact] = await tx
      .insert(coachMemory)
      .values({ userId: friend, kind: "goal", text: "SECRET goal" })
      .returning({ id: coachMemory.id });
    const [friendThread] = await tx
      .insert(coachThreads)
      .values({ userId: friend, kind: "chat", title: "SECRET thread" })
      .returning({ id: coachThreads.id });
    if (!friendFact || !friendThread) throw new Error("friend's private rows not created");
    await tx.execute(sql`insert into public.coach_messages (thread_id, user_id, role, parts)
      values (${friendThread.id}, ${friend}, 'user', '[{"type":"text","text":"SECRET chat"}]'::jsonb)`);

    const progress = await progressData(me, tx, now);
    const fresh = await snapshotReadiness(me, today, tx);
    expect(
      "progress is my own readiness, computed now like Today and Me, and my campaign",
      progress.snapshot.overall === fresh.overall && progress.snapshot.overall !== 13 && progress.campaign?.length === 30,
      JSON.stringify({ overall: progress.snapshot.overall, fresh: fresh.overall, campaign: progress.campaign }),
    );

    const weak = await weakSpotsData(me, tx, now);
    expect(
      "weak spots use only my misses, cards and mocks",
      weak.misses.length === 0 && weak.cardAnswers.length === 1 && weak.mocks.length === 1 && weak.mocks[0]?.score === 80 && !leaks(weak),
      JSON.stringify({ misses: weak.misses, cards: weak.cardAnswers.length, mocks: weak.mocks }),
    );

    const activity = await recentActivityData(me, tx, now);
    expect(
      "recent activity has only my check-ins, cards and mocks, and no notes",
      activity.checkins.length === 1 &&
        activity.checkins[0]?.title === "CT 2" &&
        activity.cardAnswers.length === 1 &&
        activity.mocks.length === 1 &&
        !leaks(activity),
      JSON.stringify(activity.checkins),
    );

    await planData(friend, tx, now);
    const plan = await planData(me, tx, now);
    const myMissions = await tx
      .select()
      .from(missions)
      .where(and(eq(missions.userId, me), eq(missions.date, today)));
    expect(
      "the plan is my missions and my template",
      plan.today?.missions.length === myMissions.length && plan.templates?.[1]?.new_problem === 1 && plan.today.lengthDays === 30,
      `${plan.today?.missions.length ?? 0} vs ${myMissions.length} missions`,
    );
    expect("active templates are mine", (await activeTemplates(me, tx))?.[1]?.cards === 0);

    const unsolved = await findProblemsData(me, { pattern: "Coach test pattern", status: "unsolved" }, tx);
    const solved = await findProblemsData(me, { pattern: "ct-pattern", status: "solved" }, tx);
    const unsolvedRows = "problems" in unsolved ? unsolved.problems : [];
    expect(
      "problem status comes from my check-ins only",
      unsolvedRows.some((p) => p.slug === "ct-p1" && p.status === null) &&
        !unsolvedRows.some((p) => p.slug === "ct-p2") &&
        solved.problems.map((p) => p.slug).join() === "ct-p2",
      JSON.stringify(unsolvedRows.map((p) => [p.slug, p.status])),
    );

    const missed = await findCardsData(me, { missed: true }, tx);
    const byTopic = await findCardsData(me, { topic: "Coach test topic" }, tx);
    expect(
      "missed cards are mine only, and card results are mine",
      missed.length === 0 &&
        byTopic.find((c) => c.id === card1)?.lastOutcome === null &&
        byTopic.find((c) => c.id === card2)?.lastOutcome === "correct",
      JSON.stringify(byTopic.map((c) => [c.promptMd, c.lastOutcome])),
    );

    const friends = summarizeFriends(await friendSummaryData(me, undefined, tx));
    const them = friends.find((f) => f.name === "Friend");
    expect(
      "friend summary has public stats only, and not me",
      them?.readiness === 13 &&
        them.mockScores.length === 1 &&
        them.mockScores[0]?.score === 40 &&
        !friends.some((f) => f.name === "You") &&
        !JSON.stringify(friends).includes(SECRET),
      JSON.stringify(friends),
    );

    expect("my thread list leaves out their threads", !(await listThreads(me, 50, tx)).some((t) => t.id === friendThread.id));
    expect("their thread isn't readable as mine", (await getThread(me, friendThread.id, tx)) === null);
    expect("their messages aren't readable as mine", (await threadMessages(me, friendThread.id, 30, tx)).length === 0);
    const taken = await ensureThread(me, { id: friendThread.id, kind: "chat", ref: null, title: "hijack" }, tx);
    const [still] = await tx.select().from(coachThreads).where(eq(coachThreads.id, friendThread.id));
    expect("a new thread can't reuse their thread id", taken === null && still?.userId === friend && still.title === "SECRET thread");

    expect("I can't edit their memory", !(await editFact(me, friendFact.id, { text: "changed" }, tx)));
    expect("I can't delete their memory", !(await deleteFact(me, friendFact.id, tx)));
    const [fact] = await tx.select().from(coachMemory).where(eq(coachMemory.id, friendFact.id));
    expect("their memory is unchanged", fact?.text === "SECRET goal");

    throw ROLLBACK;
  });
} catch (e) {
  if (e !== ROLLBACK) {
    console.error(`FAIL setup: ${(e as Error).message}`);
    failures.push("setup");
  }
}

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log("\nAll coach tool checks passed");
process.exit(0);
