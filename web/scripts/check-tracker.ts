// Checks the tracker service against the real database. Everything runs in
// one transaction that is always rolled back. Run with `bun run check:tracker`.

import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { checkins, days, missions, problemReviews, problems, roadmapProgress } from "@/db/schema";
import { addDays, localDate } from "@/lib/tracker/dates";
import {
  ensureToday,
  markStudied,
  onCardAnswered,
  onCheckins,
  refreshDay,
  skipReview,
  snapshotReadiness,
  startRevive,
  todayStats,
  unmarkStudied,
} from "@/lib/tracker/service";

const failures: string[] = [];
function expect(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures.push(name);
}

const ROLLBACK = new Error("rollback");
const user = "00000000-0000-4000-8000-0000000000f1";
const la = "00000000-0000-4000-8000-0000000000f2";
const now = new Date("2026-09-27T06:00:00Z"); // 11:30 in Kolkata
const slots = { new_problem: 1, review: 1, topic: 1 };
const templates = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [d, slots]));

try {
  await db.transaction(async (tx) => {
    for (const [id, tz] of [
      [user, "Asia/Kolkata"],
      [la, "America/Los_Angeles"],
    ] as const) {
      await tx.execute(
        sql`insert into auth.users (id, email, aud, role) values (${id}, ${`tracker-${id.slice(-2)}@example.test`}, 'authenticated', 'authenticated')`,
      );
      await tx.execute(sql`update public.user_approvals set status = 'approved', decided_at = now() where user_id = ${id}`);
      await tx.execute(sql`update public.profiles set timezone = ${tz}, setup_done_at = now() where user_id = ${id}`);
    }
    await tx.execute(
      sql`insert into public.sources (id, name, domain, role) values ('tt-src', 'Tracker test', 'dsa', 'cards') on conflict do nothing`,
    );
    await tx.execute(sql`insert into public.topics (slug, domain, name, importance, sort) values
      ('tt-pattern', 'dsa', 'Test pattern', 1, 999), ('tt-sd', 'system_design', 'Test topic', 1, 999)`);
    for (let i = 1; i <= 12; i++) {
      await tx.execute(sql`insert into public.problems (slug, kind, title, difficulty, pattern_slug, importance, source_id)
        values (${`tt-p${i}`}, 'leetcode', ${`TT ${i}`}, 'Medium', 'tt-pattern', ${1 - i / 100}, 'tt-src')`);
    }
    const today = localDate("Asia/Kolkata", now);
    await tx.execute(
      sql`insert into public.campaigns (user_id, start_date, length_days, templates) values (${user}, ${addDays(today, -3)}, 90, ${JSON.stringify(templates)}::jsonb)`,
    );

    // First open: past days closed as missed, today planned once.
    const first = await ensureToday(user, now, tx);
    expect("today is day 4 of 90", first.state === "active" && first.dayNumber === 4 && first.daysLeft === 86 && first.grid.length === 90);
    const past = await tx
      .select()
      .from(days)
      .where(and(eq(days.userId, user), eq(days.status, "missed")));
    expect("unopened past days are marked missed", past.length === 3);
    const count = async () =>
      (
        await tx
          .select()
          .from(missions)
          .where(and(eq(missions.userId, user), eq(missions.date, today)))
      ).length;
    const planned = await count();
    expect("today has missions", planned > 0, `${planned}`);
    await ensureToday(user, now, tx);
    await Promise.all([ensureToday(user, now, tx), ensureToday(user, now, tx)]);
    expect("opening again never plans twice", (await count()) === planned);

    // Ten check-ins at once (two per problem): each mission ticks once, the ladder moves once per problem.
    const mine = first.state === "active" ? first.missions : [];
    const newOne = mine.find((m) => m.slotType === "new_problem")!;
    const slugs = [newOne.ref, "tt-p9", "tt-p10", "tt-p11", "tt-p12"];
    const batch: { slug: string; result: "solved" | "hints" | "failed"; createdAt: string; checkinId: string }[] = [];
    for (const [i, slug] of slugs.entries()) {
      for (const [j, result] of (["failed", i % 2 ? "hints" : "solved"] as const).entries()) {
        const [row] = await tx
          .insert(checkins)
          .values({ userId: user, problemSlug: slug, result, createdAt: `2026-09-27T0${j + 1}:00:00Z` })
          .returning({ id: checkins.id, createdAt: checkins.createdAt });
        if (!row) throw new Error("check-in not saved");
        batch.push({ slug, result, createdAt: row.createdAt, checkinId: row.id });
      }
    }
    await onCheckins(user, batch, tx, now);
    const ticked = await tx
      .select()
      .from(missions)
      .where(and(eq(missions.userId, user), eq(missions.date, today), eq(missions.status, "done")));
    // The planner picks from the real catalog, so the other new-problem slot may sit in any
    // pattern: it must tick exactly when one of the check-ins shares its pattern.
    const patternRows = await tx
      .select({ slug: problems.slug, pattern: problems.patternSlug })
      .from(problems)
      .where(inArray(problems.slug, [...slugs, ...mine.map((m) => m.ref)]));
    const patternOf = new Map(patternRows.map((r) => [r.slug, r.pattern]));
    const checkinPatterns = new Set(slugs.map((s) => patternOf.get(s)));
    const newMissions = mine.filter((m) => m.slotType === "new_problem");
    const tickedNew = ticked.filter((m) => m.slotType === "new_problem");
    const shouldTick = newMissions.filter((m) => slugs.includes(m.ref) || checkinPatterns.has(patternOf.get(m.ref)));
    expect(
      "the planned problem ticked, and same-pattern extra work ticks only matching slots, once each",
      tickedNew.some((m) => m.ref === newOne.ref) &&
        tickedNew.length === shouldTick.length &&
        new Set(tickedNew.map((m) => m.checkinId)).size === tickedNew.length,
      `${tickedNew.length}/${shouldTick.length}`,
    );
    // Readiness after today's check-ins: Today shows the number Me computes, not last midnight's snapshot.
    await tx.execute(sql`insert into public.readiness_snapshots (user_id, date, overall) values (${user}, ${addDays(today, -1)}, 99)`);
    const todayReadiness = (await todayStats(user, today, tx)).readiness;
    const meReadiness = (await snapshotReadiness(user, today, tx)).overall;
    expect("Today's readiness matches Me's after new check-ins", todayReadiness === meReadiness, `${todayReadiness} vs ${meReadiness}`);

    const ladder = await tx.select().from(problemReviews).where(eq(problemReviews.userId, user));
    expect(
      "only problems whose latest try needed hints entered the ladder",
      ladder.length === 2 && ladder.every((r) => r.step === 1 && r.dueDate === addDays(today, 3)),
      `${ladder.length}`,
    );

    // Undoing a study must untick the boxes studying ticked and leave alone the
    // ones the reader ticked by hand. `roadmap_progress.source` exists for this,
    // and the delete ignored it, so a hand-ticked node was lost on every undo.
    await tx.execute(sql`insert into public.roadmap_nodes (id, roadmap, domain, label, kind, sort, topic_slug) values
      ('tt-node-linked', 'tt', 'system_design', 'Linked', 'topic', 1, 'tt-sd'),
      ('tt-node-hand', 'tt', 'system_design', 'By hand', 'topic', 2, 'tt-sd')`);
    await tx.insert(roadmapProgress).values({ userId: user, nodeId: "tt-node-hand", source: "manual" });
    await markStudied(user, "tt-sd", tx, now);
    await unmarkStudied(user, "tt-sd", tx);
    const ticks = await tx
      .select({ nodeId: roadmapProgress.nodeId, source: roadmapProgress.source })
      .from(roadmapProgress)
      .where(eq(roadmapProgress.userId, user));
    expect(
      "undoing a study unticks its own boxes and keeps the hand-ticked one",
      ticks.length === 1 && ticks[0]?.nodeId === "tt-node-hand" && ticks[0]?.source === "manual",
      JSON.stringify(ticks),
    );
    await tx.delete(roadmapProgress).where(eq(roadmapProgress.userId, user));

    // Finish the rest: topic via Mark studied, review via "Not today".
    const topic = mine.find((m) => m.slotType === "topic");
    if (topic) await markStudied(user, topic.ref, tx, now);
    const review = mine.find((m) => m.slotType === "review");
    if (review) await skipReview(user, review.id, "not_today", tx);
    await tx
      .update(missions)
      .set({ status: "done" })
      .where(and(eq(missions.userId, user), eq(missions.date, today), eq(missions.status, "open")));
    await refreshDay(user, today, tx);
    const view = await ensureToday(user, now, tx);
    expect("a finished day is done and starts a streak", view.state === "active" && view.status === "done" && view.streak === 1);

    // An extra mission added after the day is done (Coach, "Queue next problem") must not reopen it.
    await tx.insert(missions).values({
      userId: user,
      date: today,
      slotType: "new_problem",
      ref: "tt-p8",
      estMinutes: 40,
      reason: "Added by Coach",
      isExtra: true,
    });
    await refreshDay(user, today, tx);
    const withExtra = await ensureToday(user, now, tx);
    expect(
      "an extra mission doesn't reopen a finished day",
      withExtra.state === "active" && withExtra.status === "done" && withExtra.streak === 1,
      withExtra.state === "active" ? withExtra.status : withExtra.state,
    );
    await tx.delete(missions).where(and(eq(missions.userId, user), eq(missions.date, today), eq(missions.isExtra, true)));

    // Revive yesterday (never opened): its template is planned as extra work.
    const yesterday = addDays(today, -1);
    expect("yesterday can be revived", view.state === "active" && view.revivable.includes(yesterday));
    const r = await startRevive(user, yesterday, tx, now);
    const revive = await tx
      .select()
      .from(missions)
      .where(and(eq(missions.userId, user), eq(missions.isRevive, true)));
    expect(
      "revive adds yesterday's slots to today",
      "ok" in r && revive.length > 0 && revive.every((m) => m.reviveOf === yesterday),
      `${revive.length}`,
    );
    await tx
      .update(missions)
      .set({ status: "done" })
      .where(and(eq(missions.userId, user), eq(missions.isRevive, true)));
    await refreshDay(user, today, tx);
    const after = await ensureToday(user, now, tx);
    expect(
      "a revived day keeps the streak",
      after.state === "active" && after.streak === 2,
      after.state === "active" ? `${after.streak}` : "",
    );
    expect("an older missed day can't be revived", "error" in (await startRevive(user, addDays(today, -3), tx, now)));

    // A day that was opened and left unfinished: its leftovers collide with today's
    // plan (same unsolved problem, same topic), and revive must still add real work.
    const r3 = "00000000-0000-4000-8000-0000000000f3";
    await tx.execute(
      sql`insert into auth.users (id, email, aud, role) values (${r3}, 'tracker-f3@example.test', 'authenticated', 'authenticated')`,
    );
    await tx.execute(sql`update public.user_approvals set status = 'approved', decided_at = now() where user_id = ${r3}`);
    await tx.execute(sql`update public.profiles set timezone = 'Asia/Kolkata', setup_done_at = now() where user_id = ${r3}`);
    await tx.execute(
      sql`insert into public.campaigns (user_id, start_date, length_days, templates) values (${r3}, ${addDays(today, -1)}, 90, ${JSON.stringify(templates)}::jsonb)`,
    );
    const yesterdayNow = new Date(now.getTime() - 86_400_000);
    await ensureToday(r3, yesterdayNow, tx); // opened yesterday, did nothing
    await ensureToday(r3, now, tx); // today's plan overlaps yesterday's leftovers
    const opened = await startRevive(r3, addDays(today, -1), tx, now);
    const r3Revive = await tx
      .select()
      .from(missions)
      .where(and(eq(missions.userId, r3), eq(missions.isRevive, true)));
    const r3Leftovers = await tx
      .select()
      .from(missions)
      .where(and(eq(missions.userId, r3), eq(missions.date, addDays(today, -1)), eq(missions.status, "open")));
    const countable = r3Leftovers.filter((m) => m.status !== "coming_soon").length;
    expect(
      "reviving an opened day adds as much work as was left",
      "ok" in opened && r3Revive.length === countable,
      `${r3Revive.length}/${countable}`,
    );
    const again = await startRevive(r3, addDays(today, -1), tx, now);
    const r3After = await tx
      .select()
      .from(missions)
      .where(and(eq(missions.userId, r3), eq(missions.isRevive, true)));
    expect("tapping revive twice adds nothing more", "error" in again && r3After.length === r3Revive.length);

    // A revive finishes only on done missions: "Not today" on one of them leaves the day unrevived.
    const [skipped] = r3Revive;
    if (skipped) {
      await tx
        .update(missions)
        .set({ status: "done" })
        .where(and(eq(missions.userId, r3), eq(missions.isRevive, true)));
      await tx.update(missions).set({ status: "skipped" }).where(eq(missions.id, skipped.id));
      await refreshDay(r3, today, tx);
      const [revivedDay] = await tx
        .select({ status: days.status })
        .from(days)
        .where(and(eq(days.userId, r3), eq(days.date, addDays(today, -1))));
      expect("a skipped revive mission doesn't revive the day", revivedDay?.status === "missed", revivedDay?.status ?? "no row");
    } else {
      expect("r3 has a revive mission to test with", false);
    }

    // Old synced check-ins move the ladder but never tick today's missions.
    const r3Today = await tx
      .select()
      .from(missions)
      .where(and(eq(missions.userId, r3), eq(missions.date, today), eq(missions.slotType, "new_problem"), eq(missions.isRevive, false)));
    const old = r3Today[0];
    if (old) {
      const [row] = await tx
        .insert(checkins)
        .values({ userId: r3, problemSlug: old.ref, result: "failed", createdAt: new Date(now.getTime() - 3 * 86_400_000).toISOString() })
        .returning({ id: checkins.id, createdAt: checkins.createdAt });
      if (!row) throw new Error("check-in not saved");
      await onCheckins(r3, [{ slug: old.ref, result: "failed", createdAt: row.createdAt, checkinId: row.id }], tx, now);
      const [still] = await tx.select().from(missions).where(eq(missions.id, old.id));
      const ladder3 = await tx
        .select()
        .from(problemReviews)
        .where(and(eq(problemReviews.userId, r3), eq(problemReviews.problemSlug, old.ref)));
      expect("a check-in from 3 days ago doesn't tick today's mission", still?.status === "open");
      expect("…but it still enters the review ladder", ladder3.length === 1);
    } else {
      expect("r3 has a new-problem mission to test with", false);
    }

    // Card missions: real once a card is live; every 10 answers today tick one.
    const r4 = "00000000-0000-4000-8000-0000000000f4";
    await tx.execute(
      sql`insert into auth.users (id, email, aud, role) values (${r4}, 'tracker-f4@example.test', 'authenticated', 'authenticated')`,
    );
    await tx.execute(sql`update public.user_approvals set status = 'approved', decided_at = now() where user_id = ${r4}`);
    await tx.execute(sql`update public.profiles set timezone = 'Asia/Kolkata', setup_done_at = now() where user_id = ${r4}`);
    await tx.execute(
      sql`insert into public.campaigns (user_id, start_date, length_days, templates) values (${r4}, ${today}, 30, ${JSON.stringify(templates)}::jsonb)`,
    );
    const [liveCard] = await tx.execute<{ id: string }>(sql`
      insert into public.cards (topic_slug, format, prompt_md, answer_md, status) values ('tt-sd', 'typed', 'q', 'a', 'live') returning id`);
    const r4View = await ensureToday(r4, now, tx);
    const cardMission = r4View.state === "active" ? r4View.missions.find((m) => m.slotType === "cards") : undefined;
    expect("a card mission is open once cards are live", cardMission?.status === "open");
    const answer = (outcome: string, i: number) =>
      tx.execute(sql`insert into public.card_reviews (user_id, card_id, answer, score, outcome, graded_by, created_at)
        values (${r4}, ${liveCard?.id}, 'x', 1, ${outcome}, 'match', ${new Date(now.getTime() - i * 1000).toISOString()})`);
    for (let i = 0; i < 9; i++) await answer("correct", i);
    await answer("skipped", 20);
    await onCardAnswered(r4, tx, now);
    const [afterNine] = await tx
      .select()
      .from(missions)
      .where(eq(missions.id, cardMission?.id ?? ""));
    await answer("wrong", 30);
    await onCardAnswered(r4, tx, now);
    const [afterTen] = await tx
      .select()
      .from(missions)
      .where(eq(missions.id, cardMission?.id ?? ""));
    expect("9 answers plus a skip don't tick it; the 10th answer does", afterNine?.status === "open" && afterTen?.status === "done");

    // Reviving a day whose card mission was left open: the copy gets its own ref
    // (today has its own cards-1), and answers tick it once today's is done.
    const r5 = "00000000-0000-4000-8000-0000000000f5";
    await tx.execute(
      sql`insert into auth.users (id, email, aud, role) values (${r5}, 'tracker-f5@example.test', 'authenticated', 'authenticated')`,
    );
    await tx.execute(sql`update public.user_approvals set status = 'approved', decided_at = now() where user_id = ${r5}`);
    await tx.execute(sql`update public.profiles set timezone = 'Asia/Kolkata', setup_done_at = now() where user_id = ${r5}`);
    await tx.execute(
      sql`insert into public.campaigns (user_id, start_date, length_days, templates) values (${r5}, ${addDays(today, -1)}, 30, ${JSON.stringify(templates)}::jsonb)`,
    );
    const r5Yesterday = addDays(today, -1);
    await ensureToday(r5, new Date(now.getTime() - 86_400_000), tx);
    await tx
      .update(missions)
      .set({ status: "done" })
      .where(and(eq(missions.userId, r5), eq(missions.date, r5Yesterday), sql`${missions.slotType} <> 'cards'`));
    await ensureToday(r5, now, tx);
    const r5Revive = await startRevive(r5, r5Yesterday, tx, now);
    const r5Cards = await tx
      .select()
      .from(missions)
      .where(and(eq(missions.userId, r5), eq(missions.date, today), eq(missions.slotType, "cards")));
    const revivedCards = r5Cards.filter((m) => m.isRevive);
    expect(
      "a revived card mission is added next to today's own, not dropped",
      "ok" in r5Revive && revivedCards.length === 1 && r5Cards.length === 2 && revivedCards[0]?.ref !== "cards-1",
      JSON.stringify(r5Cards.map((m) => m.ref)),
    );
    for (let i = 0; i < 20; i++) {
      await tx.execute(sql`insert into public.card_reviews (user_id, card_id, answer, score, outcome, graded_by, created_at)
        values (${r5}, ${liveCard?.id}, 'x', 1, 'correct', 'match', ${new Date(now.getTime() - i * 1000).toISOString()})`);
    }
    await onCardAnswered(r5, tx, now);
    const r5CardsAfter = await tx
      .select({ status: missions.status })
      .from(missions)
      .where(and(eq(missions.userId, r5), eq(missions.date, today), eq(missions.slotType, "cards")));
    const [r5Day] = await tx
      .select({ status: days.status })
      .from(days)
      .where(and(eq(days.userId, r5), eq(days.date, r5Yesterday)));
    expect(
      "20 card answers finish today's card mission and the revived one, so the day is revived",
      r5Day?.status === "revived" && r5CardsAfter.length === 2 && r5CardsAfter.every((m) => m.status === "done"),
      JSON.stringify({ day: r5Day?.status, cards: r5CardsAfter.map((m) => m.status) }),
    );

    // Time zones: 06:00Z is still the 26th in Los Angeles.
    await tx.execute(
      sql`insert into public.campaigns (user_id, start_date, length_days, templates) values (${la}, '2026-09-20', 30, ${JSON.stringify(templates)}::jsonb)`,
    );
    const laView = await ensureToday(la, now, tx);
    expect(
      "Los Angeles user gets their own date",
      laView.state === "active" && laView.today === "2026-09-26",
      laView.state === "active" ? laView.today : laView.state,
    );

    // problems.hidden: a problem the catalog dropped but someone's history holds. It stays in
    // readiness only for someone who tried it, and Today never plans it as a new problem.
    const dsaCoverage = async () => (await snapshotReadiness(user, today, tx)).perArea.dsa?.coverage ?? 0;
    // Row order changes the float sum in its last digits, hence the tolerance below.
    const coverageBefore = await dsaCoverage();
    await tx.execute(sql`update public.problems set hidden = true where slug = 'tt-p9'`);
    const coverageTriedHidden = await dsaCoverage();
    await tx.execute(sql`update public.problems p set hidden = true where p.kind = 'leetcode'
      and not exists (select 1 from public.checkins c where c.user_id = ${user} and c.problem_slug = p.slug)`);
    const coverageUntriedHidden = await dsaCoverage();
    expect(
      "hiding a problem someone tried leaves their coverage; hiding the ones they never tried stops counting them",
      Math.abs(coverageTriedHidden - coverageBefore) < 1e-9 && coverageBefore < 1 && Math.abs(coverageUntriedHidden - 1) < 1e-9,
      `${coverageBefore} -> ${coverageTriedHidden} -> ${coverageUntriedHidden}`,
    );
    const r6 = "00000000-0000-4000-8000-0000000000f6";
    await tx.execute(
      sql`insert into auth.users (id, email, aud, role) values (${r6}, 'tracker-f6@example.test', 'authenticated', 'authenticated')`,
    );
    await tx.execute(sql`update public.user_approvals set status = 'approved', decided_at = now() where user_id = ${r6}`);
    await tx.execute(sql`update public.profiles set timezone = 'Asia/Kolkata', setup_done_at = now() where user_id = ${r6}`);
    await tx.execute(
      sql`insert into public.campaigns (user_id, start_date, length_days, templates) values (${r6}, ${today}, 30, ${JSON.stringify(templates)}::jsonb)`,
    );
    const shownBefore = await ensureToday(r6, now, tx);
    await tx.execute(sql`update public.problems set hidden = true where kind = 'leetcode'`);
    await tx.execute(sql`delete from public.missions where user_id = ${r6}`);
    await tx.execute(sql`delete from public.days where user_id = ${r6}`);
    const r6View = await ensureToday(r6, now, tx);
    const newProblems = (v: typeof r6View) => (v.state === "active" ? v.missions.filter((m) => m.slotType === "new_problem").length : -1);
    expect(
      "Today plans no new problem from a hidden one",
      newProblems(shownBefore) > 0 && newProblems(r6View) === 0,
      `${newProblems(shownBefore)} -> ${newProblems(r6View)}`,
    );

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
console.log("\nAll tracker checks passed");
process.exit(0);
