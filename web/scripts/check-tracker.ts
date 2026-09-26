// Checks the tracker service against the real database. Everything runs in
// one transaction that is always rolled back. Run with `bun run check:tracker`.

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { checkins, days, missions, problemReviews } from "@/db/schema";
import { addDays, localDate } from "@/lib/tracker/dates";
import { ensureToday, markStudied, onCheckins, refreshDay, skipReview, startRevive } from "@/lib/tracker/service";

const failures: string[] = [];
function expect(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures.push(name);
}

const ROLLBACK = new Error("rollback");
const user = "00000000-0000-4000-8000-0000000000f1";
const la = "00000000-0000-4000-8000-0000000000f2";
const now = new Date("2026-09-27T06:00:00Z"); // 11:30 in Kolkata
const slots = { new_problem: 1, review: 1, topic: 1, cards: 1 };
const templates = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [d, slots]));

try {
  await db.transaction(async (tx) => {
    for (const [id, tz] of [[user, "Asia/Kolkata"], [la, "America/Los_Angeles"]]) {
      await tx.execute(sql`insert into auth.users (id, email, aud, role) values (${id}, ${`tracker-${id.slice(-2)}@example.test`}, 'authenticated', 'authenticated')`);
      await tx.execute(sql`update public.user_approvals set status = 'approved', decided_at = now() where user_id = ${id}`);
      await tx.execute(sql`update public.profiles set timezone = ${tz}, setup_done_at = now() where user_id = ${id}`);
    }
    await tx.execute(sql`insert into public.sources (id, name, domain, role) values ('tt-src', 'Tracker test', 'dsa', 'cards') on conflict do nothing`);
    await tx.execute(sql`insert into public.topics (slug, domain, name, importance, sort) values
      ('tt-pattern', 'dsa', 'Test pattern', 1, 999), ('tt-sd', 'system_design', 'Test topic', 1, 999)`);
    for (let i = 1; i <= 12; i++) {
      await tx.execute(sql`insert into public.problems (slug, kind, title, difficulty, pattern_slug, importance, source_id)
        values (${`tt-p${i}`}, 'leetcode', ${`TT ${i}`}, 'Medium', 'tt-pattern', ${1 - i / 100}, 'tt-src')`);
    }
    const today = localDate("Asia/Kolkata", now);
    await tx.execute(sql`insert into public.campaigns (user_id, start_date, length_days, templates) values (${user}, ${addDays(today, -3)}, 90, ${JSON.stringify(templates)}::jsonb)`);

    // First open: past days closed as missed, today planned once.
    const first = await ensureToday(user, now, tx);
    expect("today is day 4 of 90", first.state === "active" && first.dayNumber === 4 && first.daysLeft === 86 && first.grid.length === 90);
    const past = await tx.select().from(days).where(and(eq(days.userId, user), eq(days.status, "missed")));
    expect("unopened past days are marked missed", past.length === 3);
    const count = async () => (await tx.select().from(missions).where(and(eq(missions.userId, user), eq(missions.date, today)))).length;
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
        const [row] = await tx.insert(checkins).values({ userId: user, problemSlug: slug, result, createdAt: `2026-09-27T0${j + 1}:00:00Z` }).returning({ id: checkins.id, createdAt: checkins.createdAt });
        batch.push({ slug, result, createdAt: row.createdAt, checkinId: row.id });
      }
    }
    await onCheckins(user, batch, tx);
    const ticked = await tx.select().from(missions).where(and(eq(missions.userId, user), eq(missions.date, today), eq(missions.status, "done")));
    const newMissions = mine.filter((m) => m.slotType === "new_problem");
    const tickedNew = ticked.filter((m) => m.slotType === "new_problem");
    expect("the planned problem ticked, and same-pattern extra work ticked the other new-problem slot",
      tickedNew.some((m) => m.ref === newOne.ref) && tickedNew.length === newMissions.length && new Set(tickedNew.map((m) => m.checkinId)).size === tickedNew.length,
      `${tickedNew.length}/${newMissions.length}`);
    const ladder = await tx.select().from(problemReviews).where(eq(problemReviews.userId, user));
    expect("only problems whose latest try needed hints entered the ladder", ladder.length === 2 && ladder.every((r) => r.step === 1 && r.dueDate === addDays(today, 3)), `${ladder.length}`);

    // Finish the rest: topic via Mark studied, review via "Not today".
    const topic = mine.find((m) => m.slotType === "topic");
    if (topic) await markStudied(user, topic.ref, tx);
    const review = mine.find((m) => m.slotType === "review");
    if (review) await skipReview(user, review.id, "not_today", tx);
    await tx.update(missions).set({ status: "done" }).where(and(eq(missions.userId, user), eq(missions.date, today), eq(missions.status, "open")));
    await refreshDay(user, today, tx);
    const view = await ensureToday(user, now, tx);
    expect("a finished day is done and starts a streak", view.state === "active" && view.status === "done" && view.streak === 1);

    // Revive yesterday (never opened): its template is planned as extra work.
    const yesterday = addDays(today, -1);
    expect("yesterday can be revived", view.state === "active" && view.revivable.includes(yesterday));
    const r = await startRevive(user, yesterday, tx);
    const revive = await tx.select().from(missions).where(and(eq(missions.userId, user), eq(missions.isRevive, true)));
    expect("revive adds yesterday's slots to today", "ok" in r && revive.length > 0 && revive.every((m) => m.reviveOf === yesterday), `${revive.length}`);
    await tx.update(missions).set({ status: "done" }).where(and(eq(missions.userId, user), eq(missions.isRevive, true)));
    await refreshDay(user, today, tx);
    const after = await ensureToday(user, now, tx);
    expect("a revived day keeps the streak", after.state === "active" && after.streak === 2, after.state === "active" ? `${after.streak}` : "");
    expect("an older missed day can't be revived", "error" in (await startRevive(user, addDays(today, -3), tx)));

    // Time zones: 06:00Z is still the 26th in Los Angeles.
    await tx.execute(sql`insert into public.campaigns (user_id, start_date, length_days, templates) values (${la}, '2026-09-20', 30, ${JSON.stringify(templates)}::jsonb)`);
    const laView = await ensureToday(la, now, tx);
    expect("Los Angeles user gets their own date", laView.state === "active" && laView.today === "2026-09-26", laView.state === "active" ? laView.today : laView.state);

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
