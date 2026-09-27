// Checks the feed's server rules against the real database. Everything runs in
// one transaction that is always rolled back. Run with `bun run check:feed`.

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { cardReviews, cardState, cards, profiles } from "@/db/schema";
import { hideStaleCards, reportCard } from "@/lib/feed/flag-service";
import { answerCard, type FeedStore, nextCard, startDiagnostic } from "@/lib/feed/service";

const failures: string[] = [];
function expect(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures.push(name);
}

// Redis stand-in, so the checks never touch the shared Upstash instance.
function memoryStore(): FeedStore {
  const values = new Map<string, string>();
  const lists = new Map<string, string[]>();
  return {
    get: async (k) => values.get(k) ?? null,
    set: async (k, value) => {
      values.set(k, value);
    },
    del: async (k) => {
      values.delete(k);
      lists.delete(k);
    },
    pop: async (k) => lists.get(k)?.shift() ?? null,
    push: async (k, list) => {
      lists.set(k, [...(lists.get(k) ?? []), ...list]);
    },
    list: async (k) => [...(lists.get(k) ?? [])],
  };
}

const ROLLBACK = new Error("rollback");
const users = [
  "00000000-0000-4000-8000-0000000000e1",
  "00000000-0000-4000-8000-0000000000e2",
  "00000000-0000-4000-8000-0000000000e3",
] as const;
const now = new Date("2026-09-27T06:00:00Z");

try {
  await db.transaction(async (tx) => {
    for (const id of users) {
      await tx.execute(
        sql`insert into auth.users (id, email, aud, role) values (${id}, ${`feed-${id.slice(-2)}@example.test`}, 'authenticated', 'authenticated')`,
      );
      await tx.execute(sql`update public.user_approvals set status = 'approved', decided_at = now() where user_id = ${id}`);
    }
    await tx.execute(sql`insert into public.topics (slug, domain, name) values ('ff-topic', 'cs', 'Feed test') on conflict do nothing`);
    const inserted = await tx.execute<{ id: string }>(sql`
      insert into public.cards (topic_slug, format, prompt_md, answer_md, status) values
        ('ff-topic', 'typed', 'flag me', 'a', 'live'),
        ('ff-topic', 'typed', 'everyone skips me', 'a', 'live'),
        ('ff-topic', 'typed', 'someone answers me', 'a', 'live')
      returning id`);
    const [flagged, skipped, answered] = inserted.map((r) => r.id);
    if (!flagged || !skipped || !answered) throw new Error("test cards not created");

    // Two different users' flags hide a card; the same user flagging twice doesn't.
    const [u1, u2] = users;
    const once = await reportCard(u1, flagged, "wrong answer", tx);
    const again = await reportCard(u1, flagged, "still wrong", tx);
    expect("one user flagging twice counts once and doesn't hide", once.flags === 1 && again.flags === 1 && !again.hidden);
    const twice = await reportCard(u2, flagged, "unclear", tx);
    const [row] = await tx.select().from(cards).where(eq(cards.id, flagged));
    expect("two users' flags hide the card", twice.hidden && row?.hidden === true && row.flagCount === 2);

    // Stale sweep: only cards everyone skipped for 14+ days.
    const review = (card: string, user: string, outcome: string, daysAgo: number) =>
      tx.execute(sql`insert into public.card_reviews (user_id, card_id, answer, score, outcome, graded_by, created_at)
        values (${user}, ${card}, '', 0, ${outcome}, 'skip', ${new Date(now.getTime() - daysAgo * 86_400_000).toISOString()})`);
    await review(skipped, u1, "skipped", 20);
    await review(skipped, u2, "skipped", 15);
    await review(answered, u1, "skipped", 20);
    await review(answered, u2, "correct", 15);
    await hideStaleCards(now, tx);
    const state = await tx.execute<{ id: string; hidden: boolean }>(
      sql`select id, hidden from public.cards where id in (${skipped}, ${answered})`,
    );
    const hidden = new Map(state.map((r) => [r.id, r.hidden]));
    expect("a card everyone skipped for 14 days is hidden", hidden.get(skipped) === true);
    expect("a card someone answered stays", hidden.get(answered) === false);

    const [typed, hiddenInQueue, liveInQueue] = (
      await tx.execute<{ id: string }>(sql`
        insert into public.cards (topic_slug, format, difficulty, prompt_md, answer_md, key_points, status, hidden) values
          ('ff-topic', 'typed', 'Easy', 'name two things', 'alpha and beta', '["alpha", "beta"]', 'live', false),
          ('ff-topic', 'typed', 'Medium', 'hidden since queued', 'a', '[]', 'live', true),
          ('ff-topic', 'typed', 'Hard', 'still live', 'a', '[]', 'live', false)
        returning id`)
    ).map((r) => r.id);
    if (!typed || !hiddenInQueue || !liveInQueue) throw new Error("feed cards not created");

    // A typed answer stores one review and one state row; answering again moves the same row.
    const u3 = users[2];
    const store = memoryStore();
    const first = await answerCard(u1, { cardId: typed, answer: "Beta, then alpha." }, tx, store, now);
    const second = await answerCard(u1, { cardId: typed, skipped: true }, tx, store, new Date(now.getTime() + 86_400_000));
    const reviews = await tx
      .select({ score: cardReviews.score, gradedBy: cardReviews.gradedBy })
      .from(cardReviews)
      .where(and(eq(cardReviews.userId, u1), eq(cardReviews.cardId, typed)));
    const states = await tx
      .select({ reps: cardState.reps, lapses: cardState.lapses })
      .from(cardState)
      .where(and(eq(cardState.userId, u1), eq(cardState.cardId, typed)));
    expect(
      "an exact typed answer scores 1 without AI",
      first !== null && "score" in first && first.score === 1 && reviews.some((r) => r.gradedBy === "match"),
      JSON.stringify(first && "score" in first ? { score: first.score, pointsHit: first.pointsHit } : first),
    );
    expect("each answer stores its own review", reviews.length === 2, `${reviews.length} reviews`);
    expect(
      "a second answer updates the same state row",
      states.length === 1 && states[0]?.reps === 2 && states[0].lapses === 1 && second !== null && "outcome" in second,
      JSON.stringify(states),
    );

    // A card hidden after it was queued is skipped when its turn comes.
    await store.push(
      `90x:feed:${u2}`,
      [JSON.stringify({ id: hiddenInQueue, reason: "new" }), JSON.stringify({ id: liveInQueue, reason: "new" })],
      60,
    );
    const served = await nextCard(u2, tx, store, now);
    expect("a hidden card in the queue is skipped", served?.id === liveInQueue, `served ${served?.id ?? "nothing"}`);
    const reload = await nextCard(u2, tx, store, now);
    expect("the card on screen is served again until answered", reload?.id === liveInQueue);

    // The diagnostic asks at most 20 cards, then marks itself done.
    let card = await startDiagnostic(u3, tx, store);
    const total = card?.diagnostic?.total ?? 0;
    expect("the diagnostic picks 1 to 20 cards", total >= 1 && total <= 20, `${total} cards`);
    let summary: unknown = null;
    for (let i = 0; card?.diagnostic && i < 25; i++) {
      const result = await answerCard(u3, { cardId: card.id, skipped: true }, tx, store, now);
      if (result && "diagnosticSummary" in result && result.diagnosticSummary) summary = result.diagnosticSummary;
      card = await nextCard(u3, tx, store, now);
    }
    const [profile] = await tx.select({ doneAt: profiles.diagnosticDoneAt }).from(profiles).where(eq(profiles.userId, u3));
    const [diagnosticAnswers] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(cardReviews)
      .where(and(eq(cardReviews.userId, u3), eq(cardReviews.diagnostic, true)));
    expect(
      "the diagnostic marks itself done after its last card",
      Boolean(profile?.doneAt) && Array.isArray(summary) && diagnosticAnswers?.n === total,
      `done ${profile?.doneAt ?? "no"}, ${diagnosticAnswers?.n ?? 0} diagnostic answers`,
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
console.log("\nAll feed checks passed");
process.exit(0);
