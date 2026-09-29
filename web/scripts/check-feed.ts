// Checks the feed's server rules against the real database. Everything runs in
// one transaction that is always rolled back. Run with `bun run check:feed`.

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { cardReviews, cardState, cards, profiles, pushSubscriptions } from "@/db/schema";
import { hideStaleCards, reportCard } from "@/lib/feed/flag-service";
import {
  answerCard,
  type FeedStore,
  nextCard,
  queueFirst,
  sessionStats,
  setFeedAreas,
  startDiagnostic,
  upcomingCards,
} from "@/lib/feed/service";

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
    claim: async (k) => {
      if (values.has(k)) return false;
      values.set(k, "1");
      return true;
    },
    remove: async (k, value) => {
      lists.set(
        k,
        (lists.get(k) ?? []).filter((v) => v !== value),
      );
    },
    unshift: async (k, list) => {
      lists.set(k, [...list, ...(lists.get(k) ?? [])]);
    },
  };
}

const ROLLBACK = new Error("rollback");
const users = [
  "00000000-0000-4000-8000-0000000000e1",
  "00000000-0000-4000-8000-0000000000e2",
  "00000000-0000-4000-8000-0000000000e3",
  // Three more for the Coach's queueing, which needs its own feed areas: refuse
  // an out-of-area card, prove a repeat leaves one copy, and prove the card on
  // screen comes back.
  "00000000-0000-4000-8000-0000000000e4",
  "00000000-0000-4000-8000-0000000000e5",
  "00000000-0000-4000-8000-0000000000e6",
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

    // Push subscriptions round-trip through Drizzle (a pulled column name once
    // came out as "p256Dh" and every push save and send failed).
    await tx.insert(pushSubscriptions).values({ userId: u1, endpoint: "https://push.example.test/e1", p256Dh: "key", auth: "auth" });
    const subs = await tx.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, u1));
    expect("push subscriptions save and load through Drizzle", subs.length === 1 && subs[0]?.p256Dh === "key");

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

    // What the Coach does when it queues cards. This used to be written by hand in
    // lib/coach/act.ts with its own copy of the key, the lifetime and the entry
    // encoding, and nothing tested it - which is how the two bugs below survived.
    const dsaTopic = "ff-dsa";
    await tx.execute(
      sql`insert into public.topics (slug, domain, name) values (${dsaTopic}, 'dsa', 'Feed test dsa') on conflict do nothing`,
    );
    const [outOfArea] = (
      await tx.execute<{ id: string }>(sql`
        insert into public.cards (topic_slug, format, prompt_md, answer_md, status, hidden)
        values (${dsaTopic}, 'typed', 'not in my areas', 'a', 'live', false) returning id`)
    ).map((r) => r.id);
    if (!outOfArea) throw new Error("out-of-area card not created");

    const coachUser = users[3];
    const coachStore = memoryStore();
    await setFeedAreas(coachUser, ["cs"], tx, coachStore);

    // A card the reader has switched off is refused, not counted. act.ts checked
    // only that a card was live, and `nextCard` then dropped it on the way out -
    // so the Coach could confirm "1 card added" and serve nothing.
    const refused = await queueFirst(coachUser, [outOfArea], tx, coachStore);
    expect("a card outside the reader's areas is not queued", refused.length === 0, JSON.stringify(refused));

    // Served next, ahead of whatever the queue already held.
    await coachStore.push(`90x:feed:${coachUser}`, [JSON.stringify({ id: typed, reason: "new" })], 60);
    const queued = await queueFirst(coachUser, [liveInQueue], tx, coachStore);
    expect("a card the Coach queues is accepted", queued.length === 1 && queued[0] === liveInQueue, JSON.stringify(queued));
    expect("and is served before what was already queued", (await nextCard(coachUser, tx, coachStore, now))?.id === liveInQueue);

    // Queueing the same card twice must not ask it twice. act.ts removed existing
    // copies by matching the exact serialised string, so any change to the entry
    // shape would have duplicated silently.
    const twiceUser = users[4];
    const twiceStore = memoryStore();
    await setFeedAreas(twiceUser, ["cs"], tx, twiceStore);
    await queueFirst(twiceUser, [liveInQueue], tx, twiceStore);
    await queueFirst(twiceUser, [liveInQueue], tx, twiceStore);
    const queueLines = await twiceStore.list(`90x:feed:${twiceUser}`);
    expect("queueing a card twice leaves one copy", queueLines.length === 1, JSON.stringify(queueLines));

    // The card already on screen must come back. Clearing `current` was needed
    // so the Coach's card is served first, but clearing it alone threw the
    // reader's half-finished card away: it was in neither place afterwards.
    const placeUser = users[5];
    const placeStore = memoryStore();
    await setFeedAreas(placeUser, ["cs"], tx, placeStore);
    await placeStore.set(`90x:feed:${placeUser}:current`, JSON.stringify({ id: typed, reason: "new" }), 60);
    await queueFirst(placeUser, [liveInQueue], tx, placeStore);
    const coachFirst = await nextCard(placeUser, tx, placeStore, now);
    expect("the Coach's card is served first", coachFirst?.id === liveInQueue, String(coachFirst?.id));
    await placeStore.del(`90x:feed:${placeUser}:current`);
    const restored = await nextCard(placeUser, tx, placeStore, now);
    expect("and the card that was on screen is served next, not lost", restored?.id === typed, String(restored?.id));

    // Offline cards start with the card on screen and never carry the answer.
    const upcoming = await upcomingCards(u2, tx, store, now);
    expect(
      "offline cards start with the card on screen, without answers",
      upcoming[0]?.id === liveInQueue && upcoming.every((c) => !("answerMd" in c) && !("keyPoints" in c)),
      `${upcoming.length} cards`,
    );

    // An offline answer sent twice (lost response, then a retry) is graded once.
    const clientId = "00000000-0000-4000-8000-00000000c11d";
    const sent = await answerCard(u2, { cardId: liveInQueue, skipped: true, clientId }, tx, store, now);
    const resent = await answerCard(u2, { cardId: liveInQueue, skipped: true, clientId }, tx, store, now);
    const [repeats] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(cardReviews)
      .where(and(eq(cardReviews.userId, u2), eq(cardReviews.cardId, liveInQueue)));
    expect(
      "a repeated clientId is ignored",
      sent !== null && "outcome" in sent && resent !== null && "duplicate" in resent && repeats?.n === 1,
      `${repeats?.n ?? 0} reviews`,
    );

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

    // Declarations: the reader telling us something the card cannot know.
    // The guard that matters is that neither button can move a score, or
    // "New to me" becomes a consequence-free way to skip a hard card.
    // A card of its own: the others already carry reviews from the blocks
    // above, and reading "the row for this user and card" would find those.
    const [fresh] = await tx.execute<{ id: string }>(sql`
      insert into public.cards (topic_slug, format, prompt_md, answer_md, status)
      values ('ff-topic', 'flash', 'never answered by anyone', 'the answer', 'live') returning id`);
    if (!fresh) throw new Error("declaration test card not created");
    const u4 = users[0];
    const beforeStats = await sessionStats(u4, tx, now);
    const declared = await answerCard(u4, { cardId: fresh.id, declare: "new_to_me" }, tx, store, now);
    const afterStats = await sessionStats(u4, tx, now);
    const [declaredRow] = await tx
      .select({ outcome: cardReviews.outcome, gradedBy: cardReviews.gradedBy, score: cardReviews.score })
      .from(cardReviews)
      .where(and(eq(cardReviews.userId, u4), eq(cardReviews.cardId, fresh.id)));
    expect(
      '"New to me" is recorded as a declaration, not an answer',
      declaredRow?.outcome === "new_to_me" && declaredRow.gradedBy === "declared" && declaredRow.score === 0,
      JSON.stringify(declaredRow),
    );
    expect(
      '"New to me" does not count toward the day\'s answered cards',
      afterStats.answered === beforeStats.answered,
      `${beforeStats.answered} -> ${afterStats.answered}`,
    );
    expect(
      "the reader still sees the answer they asked for",
      declared !== null && "answerMd" in declared && Boolean(declared.answerMd),
      declared && "answerMd" in declared ? "answer returned" : JSON.stringify(declared),
    );

    // "I already know this" is earned: one answer on the topic is not enough.
    const tooSoon = await answerCard(u4, { cardId: typed, declare: "known" }, tx, store, now);
    expect(
      '"I already know this" is refused without a record on the topic',
      tooSoon !== null && "notEligible" in tooSoon,
      JSON.stringify(tooSoon),
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
