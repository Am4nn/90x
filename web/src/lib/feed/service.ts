import "server-only";
import { and, asc, desc, eq, gte, inArray, isNull, lte, ne, notExists, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { cardReviews, cardState, cards, missions, problems, profiles, topics } from "@/db/schema";
import { seedFromId, stringList } from "@/lib/admin/review";
import {
  DAY_MS,
  MAX_ANSWER_CHARS,
  WEAK_WINDOW_DAYS,
  gradeCard,
  outcomeOf,
  parseAlternatives,
  parseConstraints,
  parsePairs,
  parsePicked,
  parseWhyStep,
  scoreToRating,
  type Answer,
  type CardAnswer,
  type Outcome,
} from "@/lib/feed/grade";
import { cardProblemListed, cardProblemListedJoined } from "@/lib/library/listed";
import { patternMap } from "@/lib/library/queries";
import { localDate } from "@/lib/tracker/dates";
import { type Db, onCardAnswered, timezoneOf } from "@/lib/tracker/service";
import { key } from "@/lib/upstash/keys";
import { redis } from "@/lib/upstash/redis";
import { awardXp } from "@/lib/xp/award";
import { cardAward } from "@/lib/xp/rules";
import { shapeOf, type Primitive } from "./archetypes";
import { pickDiagnostic } from "./diagnostic";
import {
  difficultyMix,
  parseDifficulty,
  parseDifficultyPreference,
  parseLevel,
  type DifficultyMix,
  type DifficultyPreference,
} from "./difficulty";
import { gradeWithAi } from "./grader";
import { topicMastered } from "./mastery";
import { areaCap, MIX_WINDOW, type MixCard, pickBalanced } from "./mix";
import { optionsCount, parseOptions } from "./options";
import { buildQueue, type QueueCard, type QueueItem, REASONS } from "./queue";
import { nextState, type SrsState, stretchCorrect } from "./srs";
import {
  type AnswerInput,
  type AnswerResult,
  type AreaSummary,
  type CorrectAnswer,
  cardView,
  type CardView,
  type EmptyReason,
  FEED_AREAS,
  type FeedArea,
  isPrimitive,
  parseDiagnostic,
  parseFeedAreas,
  parseQueueItem,
  type SessionStats,
  sourceLinks,
  summarizeDiagnostic,
} from "./view";
import { topicWeakness, weakTopics } from "./weakness";

// Server side of the Feed: per-user queue in Redis, grading,
// FSRS state, and the first-visit diagnostic. Uses the server connection
// (bypasses RLS), so every query is scoped by the userId the caller passes.

const QUEUE_SIZE = 30;
const REFILL_BELOW = 10;
const DUE_POOL = 100;
const WEAK_POOL = 100;
const FRESH_POOL = 200;
/** Weak-area cards answered this recently wait, so a miss isn't asked again straight away. */
const REST_DAYS = 3;
const DIAGNOSTIC_PER_AREA = 4;
/** Anything due beyond this was retired, not merely scheduled far out. */
const RETIRED_FLOOR_MS = 180 * DAY_MS;
const QUEUE_TTL = 7 * 24 * 60 * 60;
const DIAGNOSTIC_TTL = 30 * 24 * 60 * 60;
// Guards the serve loop against a queue that is somehow all unservable.
const MAX_POPS = 100;
/** How far down the queue the mix balance may reach for a card that fits the cap. */
const MIX_LOOKAHEAD = 20;

/** The few Redis operations the Feed needs, so checks can swap in memory. */
export type FeedStore = {
  get(key: string): Promise<unknown>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
  pop(key: string): Promise<unknown>;
  push(key: string, values: string[], ttlSeconds: number): Promise<void>;
  list(key: string): Promise<unknown[]>;
  /** Sets `key` only if it is absent; true when this call set it. */
  claim(key: string, ttlSeconds: number): Promise<boolean>;
  /** Removes every copy of `value`. For putting a card back at the front
   *  without leaving the old entry behind. */
  remove(key: string, value: string): Promise<void>;
  /** Puts `values` at the head, so they are served next. The Feed itself only
   *  ever appends; this exists for the Coach queueing specific cards. */
  unshift(key: string, values: string[], ttlSeconds: number): Promise<void>;
};

function redisStore(): FeedStore {
  const r = redis();
  return {
    get: (k) => r.get(k),
    set: async (k, value, ttl) => {
      await r.set(k, value, { ex: ttl });
    },
    del: async (k) => {
      await r.del(k);
    },
    pop: (k) => r.lpop(k),
    push: async (k, values, ttl) => {
      if (!values.length) return;
      await r.rpush(k, ...values);
      await r.expire(k, ttl);
    },
    list: (k) => r.lrange(k, 0, -1),
    claim: async (k, ttl) => (await r.set(k, "1", { nx: true, ex: ttl })) === "OK",
    remove: async (k, value) => {
      await r.lrem(k, 0, value);
    },
    unshift: async (k, values, ttl) => {
      if (!values.length) return;
      // Reversed, because each lpush puts its argument in front of the last.
      await r.lpush(k, ...values.toReversed());
      await r.expire(k, ttl);
    },
  };
}

// Renamed from key("feed", userId) when the queue started giving each area its
// share (2026-10-05), so queues built by the old rules are dropped, not served out.
const queueKey = (userId: string) => key("feedq", userId);
// The card on screen: served again until it is answered, so a reload or a
// second tab shows the same card instead of losing it.
const currentKey = (userId: string) => key("feed", userId, "current");
const diagnosticKey = (userId: string) => key("diag", userId);
// One per answer the browser sends with a clientId, so an offline answer
// retried after a lost response isn't graded twice.
const answerKey = (userId: string, clientId: string) => key("feed", "ans", userId, clientId);
const ANSWER_ID_TTL = 24 * 60 * 60;
// Serialises the queue advance (pop + set current), which is several store
// round-trips and so not atomic on its own. A page render is not the only
// thing that asks for the next card: the router's RSC prefetch and the service
// worker's warm-pages fetch re-render the page concurrently with the reader's
// own action, and two renders that both see no current card would both pop.
const advanceKey = (userId: string) => key("feed", userId, "advance");
/** The advance lock's lifetime, well above the slowest advance (a few queries). */
const ADVANCE_LOCK_TTL = 30;
/** How long to wait between re-reading the card a concurrent advance pinned. */
const ADVANCE_RETRY_MS = 25;
/** ~1s of patience for a concurrent advance to pin a card before giving up. */
const ADVANCE_RETRIES = 40;
/** How many upcoming cards the browser keeps for offline use. */
const OFFLINE_CARDS = 30;
/** Below this many queued cards, a request for offline cards tops the queue up first. */
const OFFLINE_REFILL_BELOW = 20;

// Self-rated ("flash") cards are retired and never served: there is no answer to give. The
// format check keeps one that is published again by mistake out of the Feed.
const LIVE = and(eq(cards.status, "live"), eq(cards.hidden, false), ne(cards.format, "self_rate"));

const VIEW_COLUMNS = {
  id: cards.id,
  format: cards.format,
  archetype: cards.archetype,
  difficulty: cards.difficulty,
  promptMd: cards.promptMd,
  options: cards.options,
  // Read for the `compose` rubric only; `cardView` drops it for every other
  // primitive, where the key points are the answer.
  keyPoints: cards.keyPoints,
  whyStep: cards.whyStep,
  value: cards.value,
  tolerance: cards.tolerance,
  sourceRefs: cards.sourceRefs,
  topicSlug: topics.slug,
  topicName: topics.name,
  area: topics.domain,
};

/** Live, visible cards among `ids`, with what the card view needs. */
async function servable(ids: string[], q: Db) {
  if (!ids.length) return [];
  return q
    .select(VIEW_COLUMNS)
    .from(cards)
    .innerJoin(topics, eq(topics.slug, cards.topicSlug))
    .where(and(inArray(cards.id, ids), LIVE));
}

/**
 * The same, but refusing a card this reader has already answered and is not yet
 * due to see again.
 *
 * The queue and the card on screen live in Redis, and the answer lives in
 * Postgres. `nextCard` checked a queued card was live and in area, not that it
 * was unanswered, so any drift between the two served a question the reader had
 * just finished: `queueFirst` racing `answerCard`'s delete, a pin re-set by a
 * concurrent RSC prefetch, a queue entry written before the answer landed. It
 * reached production - a self-rated card came back asking "Missed it / Got it"
 * one navigation after being marked wrong, still labelled "New card", because
 * the reason is written into the queue entry and does not know what happened
 * since.
 *
 * This was a known risk, left alone because every guard tried "moved the check
 * somewhere it would run on every pop". It runs on every pop now, but it costs
 * nothing: `serve` already makes this round trip, so the guard is a join on a
 * query that was happening anyway.
 *
 * A card whose `due_at` has passed is still served - that is a review falling
 * due, which is the point of the schedule.
 */
async function servableFor(ids: string[], userId: string, now: Date, q: Db) {
  if (!ids.length) return [];
  return q
    .select(VIEW_COLUMNS)
    .from(cards)
    .innerJoin(topics, eq(topics.slug, cards.topicSlug))
    .leftJoin(cardState, and(eq(cardState.cardId, cards.id), eq(cardState.userId, userId)))
    .where(and(inArray(cards.id, ids), LIVE, or(isNull(cardState.cardId), lte(cardState.dueAt, now.toISOString()))));
}

export async function feedAreas(userId: string, q: Db = db): Promise<FeedArea[]> {
  const [row] = await q.select({ feedTopics: profiles.feedTopics }).from(profiles).where(eq(profiles.userId, userId));
  return parseFeedAreas(row?.feedTopics ?? null);
}

/** The reader's difficulty preference, stored beside the areas in the same
 *  `feed_topics` jsonb so no new column was needed. */
export async function difficultyPreference(userId: string, q: Db = db): Promise<DifficultyPreference> {
  const [row] = await q.select({ feedTopics: profiles.feedTopics }).from(profiles).where(eq(profiles.userId, userId));
  return parseDifficultyPreference(row?.feedTopics ?? null);
}

/** Merges one key into `feed_topics` in a single statement, so an area write and a difficulty
 *  write that land together each keep the other's half instead of overwriting it. */
const mergeFeedTopics = (patch: { areas: FeedArea[] } | { difficulty: DifficultyPreference }) =>
  sql`coalesce(${profiles.feedTopics}, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb`;

export async function setFeedAreas(userId: string, areas: FeedArea[], q: Db = db, store: FeedStore = redisStore()) {
  await q
    .update(profiles)
    .set({ feedTopics: mergeFeedTopics({ areas }) })
    .where(eq(profiles.userId, userId));
  // The queue was picked for the old areas; the next card refills it.
  await store.del(queueKey(userId));
}

export async function setDifficultyPreference(
  userId: string,
  preference: DifficultyPreference,
  q: Db = db,
  store: FeedStore = redisStore(),
) {
  await q
    .update(profiles)
    .set({ feedTopics: mergeFeedTopics({ difficulty: preference }) })
    .where(eq(profiles.userId, userId));
  // The queue was picked for the old mix; the next card refills it.
  await store.del(queueKey(userId));
}

/** How many graded answers make up the rolling accuracy window. */
const ROLLING_WINDOW = 20;

/** Correct share of the reader's last ~20 graded answers; null before any.
 *  Counts `correct`/`wrong` only — the set `isGraded` defines — so skips and
 *  the reader's own declarations carry no performance signal. */
async function rollingAccuracy(userId: string, q: Db): Promise<number | null> {
  const rows = await q
    .select({ outcome: cardReviews.outcome })
    .from(cardReviews)
    .where(and(eq(cardReviews.userId, userId), inArray(cardReviews.outcome, ["correct", "wrong"])))
    .orderBy(desc(cardReviews.createdAt))
    .limit(ROLLING_WINDOW);
  if (!rows.length) return null;
  return rows.filter((row) => row.outcome === "correct").length / rows.length;
}

/** The mix the next queue should aim for: rolling accuracy when there are
 *  answers, the self-declared level until then, shifted by the preference. */
async function difficultyMixFor(userId: string, q: Db): Promise<DifficultyMix> {
  const [profile] = await q
    .select({ level: profiles.level, feedTopics: profiles.feedTopics })
    .from(profiles)
    .where(eq(profiles.userId, userId));
  return difficultyMix(await rollingAccuracy(userId, q), parseLevel(profile?.level), parseDifficultyPreference(profile?.feedTopics));
}

async function liveCardCount(areas: readonly string[], q: Db): Promise<number> {
  if (!areas.length) return 0;
  const [row] = await q
    .select({ n: sql<number>`count(*)::int` })
    .from(cards)
    .innerJoin(topics, eq(topics.slug, cards.topicSlug))
    .where(and(LIVE, inArray(topics.domain, [...areas])));
  return row?.n ?? 0;
}

/** Why there is no card to show. */
export async function emptyReason(userId: string, q: Db = db): Promise<EmptyReason> {
  const areas = await feedAreas(userId, q);
  if (!areas.length) return "areas_off";
  return (await liveCardCount(areas, q)) ? "nothing_left" : "no_cards";
}

/** Coerces a pool row's `cards.difficulty` text into the three labels (or null). */
function toQueueCards(rows: { id: string; topic: string; area: string; difficulty: string | null }[]): QueueCard[] {
  return rows.map((row) => ({ ...row, difficulty: parseDifficulty(row.difficulty) }));
}

/** The three candidate pools a refill draws from: due reviews, weak topics, new cards. Exported for check:feed. */
export async function pools(userId: string, areas: FeedArea[], now: Date, q: Db) {
  const inAreas = and(LIVE, inArray(topics.domain, areas));
  const poolColumns = { id: cards.id, topic: topics.slug, area: topics.domain, difficulty: cards.difficulty };

  const [due, recent, map] = await Promise.all([
    q
      .select(poolColumns)
      .from(cardState)
      .innerJoin(cards, eq(cards.id, cardState.cardId))
      .innerJoin(topics, eq(topics.slug, cards.topicSlug))
      .where(and(eq(cardState.userId, userId), lte(cardState.dueAt, now.toISOString()), inAreas))
      .orderBy(asc(cardState.dueAt))
      .limit(DUE_POOL),
    q
      .select({ topic: cards.topicSlug, outcome: cardReviews.outcome })
      .from(cardReviews)
      .innerJoin(cards, eq(cards.id, cardReviews.cardId))
      .where(
        and(eq(cardReviews.userId, userId), gte(cardReviews.createdAt, new Date(now.getTime() - WEAK_WINDOW_DAYS * DAY_MS).toISOString())),
      ),
    areas.includes("dsa") ? patternMap(userId, q) : null,
  ]);

  const weakness = topicWeakness(
    recent.flatMap((r) => (r.topic ? [{ topic: r.topic, outcome: r.outcome as "correct" | "wrong" | "skipped" }] : [])),
  );
  const ranked = weakTopics(weakness, map?.patterns.filter((p) => p.state === "weak").map((p) => p.slug) ?? []);
  // Cards that left rotation (a correct answer on an easy card or in a topic the reader has shown,
  // or an old "I already know this"). Their schedule is a
  // year out, which keeps them out of the due pool and the fresh pool, but the
  // weak pool selects on topic alone and would serve them again after the rest
  // window.
  // Each exclusion is a correlated NOT EXISTS on the outer `cards` row, which Postgres runs
  // as an anti-join (card_state by its (user_id, card_id) key) rather than collecting every
  // id the reader has touched and testing each live card against that list, as NOT IN did.
  // The ids are never null, so the results are the same.
  const notRetired = notExists(
    q
      .select({ one: sql`1` })
      .from(cardState)
      .where(
        and(
          eq(cardState.userId, userId),
          eq(cardState.cardId, cards.id),
          gte(cardState.dueAt, new Date(now.getTime() + RETIRED_FLOOR_MS).toISOString()),
        ),
      ),
  );
  const notAnsweredLately = notExists(
    q
      .select({ one: sql`1` })
      .from(cardReviews)
      .where(
        and(
          eq(cardReviews.userId, userId),
          eq(cardReviews.cardId, cards.id),
          gte(cardReviews.createdAt, new Date(now.getTime() - REST_DAYS * DAY_MS).toISOString()),
        ),
      ),
  );
  const unseen = notExists(
    q
      .select({ one: sql`1` })
      .from(cardState)
      .where(and(eq(cardState.userId, userId), eq(cardState.cardId, cards.id))),
  );
  // New cards take turns across topics (each topic's most important card
  // first), so a fresh queue isn't one topic back to back.
  const freshRanked = q
    .select({
      ...poolColumns,
      topicImportance: topics.importance,
      turn: sql<number>`row_number() over (partition by ${topics.slug} order by ${problems.importance} desc nulls last, ${cards.createdAt}, ${cards.id})`.as(
        "turn",
      ),
    })
    .from(cards)
    .innerJoin(topics, eq(topics.slug, cards.topicSlug))
    .leftJoin(problems, eq(problems.slug, cards.problemSlug))
    // Not a card about a problem the catalog dropped: new cards are offers, like the Library.
    .where(and(inAreas, unseen, cardProblemListedJoined))
    .as("fresh");
  // Then the areas take turns too: each area's next card in that order, area
  // by area, so new cards aren't all from the area whose topics rank highest.
  const freshByArea = q
    .select({
      id: freshRanked.id,
      topic: freshRanked.topic,
      area: freshRanked.area,
      difficulty: freshRanked.difficulty,
      topicImportance: freshRanked.topicImportance,
      areaTurn:
        sql<number>`row_number() over (partition by ${freshRanked.area} order by ${freshRanked.turn}, ${freshRanked.topicImportance} desc, ${freshRanked.topic})`.as(
          "area_turn",
        ),
    })
    .from(freshRanked)
    .as("fresh_by_area");

  const [weak, fresh] = await Promise.all([
    ranked.length
      ? q
          .select(poolColumns)
          .from(cards)
          .innerJoin(topics, eq(topics.slug, cards.topicSlug))
          .where(and(inAreas, inArray(topics.slug, ranked), notAnsweredLately, notRetired, cardProblemListed))
          .orderBy(
            sql`array_position(array[${sql.join(
              ranked.map((slug) => sql`${slug}`),
              sql`, `,
            )}]::text[], ${topics.slug})`,
            asc(cards.createdAt),
            // Cards published together share a created_at; the id makes the order the same every time.
            asc(cards.id),
          )
          .limit(WEAK_POOL)
      : [],
    q
      .select({ id: freshByArea.id, topic: freshByArea.topic, area: freshByArea.area, difficulty: freshByArea.difficulty })
      .from(freshByArea)
      .orderBy(asc(freshByArea.areaTurn), desc(freshByArea.topicImportance), asc(freshByArea.area))
      .limit(FRESH_POOL),
  ]);
  return { due: toQueueCards(due), weak: toQueueCards(weak), fresh: toQueueCards(fresh) };
}

/** Tops the queue up to QUEUE_SIZE once fewer than `below` cards are left. */
async function refill(
  userId: string,
  areas: FeedArea[],
  shownTopic: string | undefined,
  now: Date,
  q: Db,
  store: FeedStore,
  below = REFILL_BELOW,
) {
  const queued = (await store.list(queueKey(userId))).flatMap((value) => parseQueueItem(value) ?? []);
  if (queued.length >= below) return;
  const current = parseQueueItem(await store.get(currentKey(userId)));
  const skip = new Set([...queued.map((item) => item.id), ...(current ? [current.id] : [])]);
  const pool = await pools(userId, areas, now, q);
  const keep = (cardsIn: QueueCard[]) => cardsIn.filter((card) => !skip.has(card.id));

  // New cards go after the ones still queued, so the topic to avoid first is the last queued one's.
  let lastTopic = shownTopic;
  const last = queued.at(-1);
  if (last) {
    const [row] = await q.select({ topic: cards.topicSlug }).from(cards).where(eq(cards.id, last.id));
    lastTopic = row?.topic ?? lastTopic;
  }
  const items = buildQueue({
    weak: keep(pool.weak),
    due: keep(pool.due),
    fresh: keep(pool.fresh),
    size: QUEUE_SIZE - queued.length,
    lastTopic,
    mix: await difficultyMixFor(userId, q),
    areaCap: areaCap(areas.length),
  });
  await store.push(
    queueKey(userId),
    items.map((item) => JSON.stringify(item)),
    QUEUE_TTL,
  );
}

async function diagnosticCard(userId: string, q: Db, store: FeedStore): Promise<CardView | null> {
  const diagnostic = parseDiagnostic(await store.get(diagnosticKey(userId)));
  if (!diagnostic) return null;
  const rows = new Map((await servable(diagnostic.ids, q)).map((row) => [row.id, row]));
  // Cards hidden since the pick drop out of the diagnostic, and out of its total.
  const ids = diagnostic.ids.filter((id) => rows.has(id));
  const total = diagnostic.total - (diagnostic.ids.length - ids.length);
  if (ids.length !== diagnostic.ids.length) {
    if (!ids.length) {
      await finishDiagnostic(userId, q, store);
      return null;
    }
    await store.set(diagnosticKey(userId), JSON.stringify({ ids, total }), DIAGNOSTIC_TTL);
  }
  const row = ids[0] ? rows.get(ids[0]) : undefined;
  if (!row) return null;
  return cardView(row, "diagnostic", { index: total - ids.length + 1, total });
}

/** The reader's last cards served, newest first: one indexed read of their
 *  reviews (answers and skips both leave one), joined to the card for its kind and area. */
async function recentServed(userId: string, q: Db): Promise<MixCard[]> {
  const rows = await q
    .select({ kind: cards.format, area: topics.domain })
    .from(cardReviews)
    .innerJoin(cards, eq(cards.id, cardReviews.cardId))
    .innerJoin(topics, eq(topics.slug, cards.topicSlug))
    .where(eq(cardReviews.userId, userId))
    .orderBy(desc(cardReviews.createdAt))
    .limit(MIX_WINDOW - 1);
  return rows;
}

/** Of the live queued cards (queue order), the one to serve so no kind fills
 *  more than MIX_CAP, and no area more than its `areaCap`, of the last MIX_WINDOW. With one card, or one allowed
 *  area, there is little to choose and the history read is skipped. */
async function pickForMix(
  live: QueueItem[],
  rows: Map<string, { id: string; format: string; area: string }>,
  areas: FeedArea[],
  userId: string,
  q: Db,
): Promise<QueueItem> {
  const first = live[0]!;
  if (live.length < 2) return first;
  const candidates = live.map((entry) => ({ kind: rows.get(entry.id)!.format, area: rows.get(entry.id)!.area }));
  const index = pickBalanced(await recentServed(userId, q), candidates, { areaCap: areaCap(areas.length) });
  return live[Math.max(index, 0)]!;
}

/**
 * The card to show: the running diagnostic first, then the card already on
 * screen, then the queue. Queued cards that were hidden or retired, or whose
 * area was switched off, are dropped as they come up.
 */
export async function nextCard(userId: string, q: Db = db, store: FeedStore = redisStore(), now = new Date()): Promise<CardView | null> {
  const diagnostic = await diagnosticCard(userId, q, store);
  if (diagnostic) return diagnostic;

  const areas = await feedAreas(userId, q);
  if (!areas.length) return null;
  const inAreas = (area: string) => (areas as string[]).includes(area);

  const serve = async (item: QueueItem): Promise<CardView | null> => {
    const [row] = await servableFor([item.id], userId, now, q);
    return row && inAreas(row.area) ? cardView(row, item.reason, null) : null;
  };

  // The card already on screen is served again, without touching the queue.
  const onScreen = parseQueueItem(await store.get(currentKey(userId)));
  if (onScreen) {
    const view = await serve(onScreen);
    if (view) return view;
    await store.del(currentKey(userId));
  }

  // Advancing the queue (pop + set current) is several store round-trips, so it
  // is not atomic. The router's RSC prefetch and the service worker's
  // warm-pages fetch re-render the page concurrently with the reader's own
  // action, so two `nextCard`s can see no current card at once and both pop,
  // the last write overwriting the card the reader is looking at (the card
  // on screen is served again until answered). A per-user
  // lock makes one writer; everyone else waits and serves the card it pins.
  for (let attempt = 0; attempt < ADVANCE_RETRIES; attempt++) {
    if (await store.claim(advanceKey(userId), ADVANCE_LOCK_TTL)) {
      try {
        // The previous holder may have pinned a card after we read `onScreen`.
        const pinned = parseQueueItem(await store.get(currentKey(userId)));
        if (pinned) {
          const view = await serve(pinned);
          if (view) return view;
          await store.del(currentKey(userId));
        }

        let refilled = false;
        for (let pops = 0; pops < MAX_POPS; pops++) {
          const queued = (await store.list(queueKey(userId))).map((value) => parseQueueItem(value));
          if (!queued.length) {
            if (refilled) break;
            await refill(userId, areas, undefined, now, q, store);
            refilled = true;
            continue;
          }
          // An unreadable or unservable head is dropped, as the plain pop always did.
          const head = queued[0];
          const window = queued.slice(0, MIX_LOOKAHEAD).flatMap((entry) => entry ?? []);
          const rows = new Map(
            (
              await servableFor(
                window.map((entry) => entry.id),
                userId,
                now,
                q,
              )
            ).map((row) => [row.id, row]),
          );
          const live = window.filter((entry) => {
            const row = rows.get(entry.id);
            return row && inAreas(row.area);
          });
          if (!head || live[0] !== head) {
            await store.pop(queueKey(userId));
            continue;
          }
          // Balance the mix: the best-ranked live card that keeps the 10-card window within the cap.
          const item = await pickForMix(live, rows, areas, userId, q);
          const row = rows.get(item.id)!;
          if (item === head) await store.pop(queueKey(userId));
          else await store.remove(queueKey(userId), JSON.stringify(item));
          const view = cardView(row, item.reason, null);
          if (!view) continue;
          await store.set(currentKey(userId), JSON.stringify(item), QUEUE_TTL);
          await refill(userId, areas, view.topic.slug, now, q, store);
          return view;
        }
        return null;
      } finally {
        await store.del(advanceKey(userId)).catch(() => undefined);
      }
    }
    // Another `nextCard` holds the lock: wait for the card it pins, then serve it.
    await new Promise((resolve) => setTimeout(resolve, ADVANCE_RETRY_MS));
    const pinned = parseQueueItem(await store.get(currentKey(userId)));
    if (pinned) {
      const view = await serve(pinned);
      if (view) return view;
      await store.del(currentKey(userId));
    }
  }

  // The lock stayed held (a stuck writer) or the queue stayed empty. Serve
  // whatever ended up on screen, if anything.
  const settled = parseQueueItem(await store.get(currentKey(userId)));
  return settled ? serve(settled) : null;
}

/**
 * The cards the Feed would serve next, in order, for the browser to keep for
 * offline use: the rest of a running diagnostic, else the card on screen and
 * the queue (topped up first when it runs low). Card views only: answers never
 * leave the server before an answer is graded.
 */
export async function upcomingCards(userId: string, q: Db = db, store: FeedStore = redisStore(), now = new Date()): Promise<CardView[]> {
  const diagnostic = parseDiagnostic(await store.get(diagnosticKey(userId)));
  if (diagnostic) {
    const rows = new Map((await servable(diagnostic.ids, q)).map((row) => [row.id, row]));
    const ids = diagnostic.ids.filter((id) => rows.has(id));
    const total = diagnostic.total - (diagnostic.ids.length - ids.length);
    return ids.flatMap((id, i) => {
      const row = rows.get(id);
      const view = row ? cardView(row, "diagnostic", { index: total - ids.length + 1 + i, total }) : null;
      return view ? [view] : [];
    });
  }

  const areas = await feedAreas(userId, q);
  if (!areas.length) return [];
  const current = parseQueueItem(await store.get(currentKey(userId)));
  await refill(userId, areas, undefined, now, q, store, OFFLINE_REFILL_BELOW);
  const queued = (await store.list(queueKey(userId))).flatMap((value) => parseQueueItem(value) ?? []);
  const items = [...(current ? [current] : []), ...queued.filter((item) => item.id !== current?.id)].slice(0, OFFLINE_CARDS);
  const rows = new Map(
    (
      await servable(
        items.map((item) => item.id),
        q,
      )
    ).map((row) => [row.id, row]),
  );
  const inAreas = (area: string) => (areas as string[]).includes(area);
  return items.flatMap((item) => {
    const row = rows.get(item.id);
    const view = row && inAreas(row.area) ? cardView(row, item.reason, null) : null;
    return view ? [view] : [];
  });
}

type Graded = {
  score: number;
  /** `ai` is the written-answer path only (`compose`): every other primitive is
   *  marked by a pure function, so no model runs when an answer is checked. */
  gradedBy: "skip" | "match" | "declared" | "pure" | "ai";
  pointsHit: boolean[] | null;
  answer: string;
};

/** What `grade` needs about the card: the correct answer the pure grader
 *  compares against, and the legacy fields for old-format rows. */
type CardForGrading = {
  answer: CardAnswer | null;
  legacy: { answer: string; keyPoints: string[] };
};

// Legacy typed grading, kept only so old-format rows and check-feed
// still grade without a model. Typed cards are leaving the Feed entirely.
const FENCE = /```[\w+-]*/g;
function legacyNormalize(text: string): string {
  return text
    .toLowerCase()
    .replace(FENCE, " ")
    .replace(/['’]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
const matchesKeyPoints = (given: string, keyPoints: string[]) => {
  const points = keyPoints.map(legacyNormalize).filter(Boolean);
  return points.length > 0 && points.every((point) => ` ${given} `.includes(` ${point} `));
};

/** The structured answer without the transport fields, for `card_reviews.answer`. */
function structuredAnswer(input: Answer & { why?: number }): Answer & { why?: number } {
  switch (input.shape) {
    case "chosen":
      return { shape: "chosen", picked: input.picked, why: input.why };
    case "ordered":
      return { shape: "ordered", order: input.order, why: input.why };
    case "mapping":
      return { shape: "mapping", pairs: input.pairs, why: input.why };
    case "number":
      return { shape: "number", value: input.value, why: input.why };
  }
}

function grade(
  input: Exclude<AnswerInput, { declare: string }>,
  card: CardForGrading,
): Graded | { ungradable: true } | { needsWhyStep: true } {
  if ("skipped" in input) return { score: 0, gradedBy: "skip", pointsHit: null, answer: "" };
  if ("shape" in input) {
    if (!card.answer) return { ungradable: true };
    const answer = structuredAnswer(input);
    // The why-step is a second screen shown only after a correct main answer.
    // When the card has one and the reader has not sent a reason yet, grade the
    // main answer alone: a correct one defers to the why-step, a wrong one goes
    // straight to the result.
    if (card.answer.whyStep && answer.why === undefined) {
      if (!gradeCard({ ...card.answer, whyStep: null }, answer)) {
        return { score: 0, gradedBy: "pure", pointsHit: null, answer: JSON.stringify(answer) };
      }
      return { needsWhyStep: true };
    }
    return { score: gradeCard(card.answer, answer), gradedBy: "pure", pointsHit: null, answer: JSON.stringify(answer) };
  }
  // A plain written answer is only ever valid for a card that has no answer
  // shape: `compose`, or a legacy typed/mcq row. Letting one reach the legacy
  // text match on a structured card meant a pick_one card could be marked
  // correct by typing words that happen to cover its key points, without ever
  // choosing the right option.
  if (card.answer) return { ungradable: true };
  const given = legacyNormalize(input.answer);
  const exact = given !== "" && (given === legacyNormalize(card.legacy.answer) || matchesKeyPoints(given, card.legacy.keyPoints));
  if (!exact) return { ungradable: true };
  return { score: 1, gradedBy: "match", pointsHit: card.legacy.keyPoints.map(() => true), answer: input.answer };
}

/** The card's correct answer, from the v2 columns. Null for a legacy
 *  card or one whose answer columns are not yet written. */
function cardAnswerOf(
  primitive: Primitive | null,
  row: {
    options: unknown;
    picked: unknown;
    constraints: unknown;
    pairs: unknown;
    value: number | null;
    tolerance: number | null;
    whyStep: unknown;
  },
): CardAnswer | null {
  if (!primitive) return null;
  const whyStep = parseWhyStep(row.whyStep);
  switch (shapeOf(primitive)) {
    case "chosen": {
      const picked = parsePicked(row.picked);
      return picked?.length ? { shape: "chosen", picked, whyStep } : null;
    }
    case "ordered": {
      const constraints = parseConstraints(row.constraints);
      // order stores its items in a flat list; assemble its tokens in an object.
      const count = optionsCount(parseOptions(primitive, row.options));
      return constraints && count
        ? { shape: "ordered", constraints, count, alternatives: parseAlternatives(row.constraints, count), whyStep }
        : null;
    }
    case "mapping": {
      const pairs = parsePairs(row.pairs);
      return pairs?.length ? { shape: "mapping", pairs, whyStep } : null;
    }
    case "number": {
      if (typeof row.value !== "number" || typeof row.tolerance !== "number") return null;
      return { shape: "number", value: row.value, tolerance: row.tolerance, whyStep };
    }
    default:
      return null; // self_rate has no answer shape
  }
}

function toSrs(row: typeof cardState.$inferSelect): SrsState {
  return {
    stability: row.stability,
    difficulty: row.difficulty,
    dueAt: new Date(row.dueAt),
    reps: row.reps,
    lapses: row.lapses,
    state: row.state,
    lastReview: row.lastReview ? new Date(row.lastReview) : null,
  };
}

/**
 * The card's answer, minus the why-step, in the shape the review draws.
 *
 * An ordered card keeps its constraints rather than one blessed sequence, so
 * that is what travels: a review that invented a single "right order" would mark
 * a genuinely correct answer wrong. The reader's own order is echoed separately
 * and each constraint is checked against it in the browser.
 */
function correctAnswer(answer: CardAnswer | null): CorrectAnswer | null {
  if (!answer) return null;
  if (answer.shape === "chosen") return { shape: "chosen", picked: answer.picked };
  if (answer.shape === "ordered")
    return { shape: "ordered", constraints: answer.constraints, count: answer.count, alternatives: answer.alternatives ?? [] };
  if (answer.shape === "mapping") return { shape: "mapping", pairs: answer.pairs };
  return { shape: "number", value: answer.value, tolerance: answer.tolerance };
}

/** Two answers to one card with the same result inside this window are one answer sent twice (a double tap, a replayed request). */
const DUPLICATE_WINDOW_MS = 60 * 1000;

/** Stores one review and moves the card's FSRS state, locking the state row so two tabs can't interleave.
 *
 *  A correct answer then waits longer than the scheduler alone would have it (`stretchCorrect`), and
 *  leaves rotation altogether when the card is labelled easy or the reader has shown the topic. */
async function saveAnswer(
  userId: string,
  cardId: string,
  graded: Graded,
  flags: { diagnostic: boolean; skipped: boolean; declared?: "new_to_me" },
  now: Date,
  q: Db,
): Promise<{ state: SrsState; xp: number }> {
  return q.transaction(async (tx) => {
    const outcome = flags.declared ?? outcomeOf(graded.score, flags.skipped);
    const [prev] = await tx
      .select()
      .from(cardState)
      .where(and(eq(cardState.userId, userId), eq(cardState.cardId, cardId)))
      .for("update");
    const [last] = await tx
      .select({ outcome: cardReviews.outcome, createdAt: cardReviews.createdAt })
      .from(cardReviews)
      .where(and(eq(cardReviews.userId, userId), eq(cardReviews.cardId, cardId)))
      .orderBy(desc(cardReviews.createdAt))
      .limit(1);
    if (prev && last && last.outcome === outcome && now.getTime() - new Date(last.createdAt).getTime() < DUPLICATE_WINDOW_MS) {
      return { state: toSrs(prev), xp: 0 };
    }
    const gradedBy = flags.declared ? "declared" : graded.gradedBy;
    await tx.insert(cardReviews).values({
      userId,
      cardId,
      answer: graded.answer.slice(0, MAX_ANSWER_CHARS),
      score: graded.score,
      pointsHit: graded.pointsHit ?? [],
      outcome,
      gradedBy,
      usedOptions: false,
      diagnostic: flags.diagnostic,
      createdAt: now.toISOString(),
    });
    // "New to me" brings the card back soon, like a miss. It is not a grade, so it does not go through scoreToRating.
    const rating = flags.declared ? 1 : scoreToRating(graded.score, flags.skipped);
    let next = nextState(prev ? toSrs(prev) : null, rating, now);
    if (outcome === "correct") {
      const [meta] = await tx.select({ difficulty: cards.difficulty, topic: cards.topicSlug }).from(cards).where(eq(cards.id, cardId));
      let retire = parseDifficulty(meta?.difficulty ?? null) === "Easy";
      if (!retire && meta?.topic) {
        const answers = await tx
          .select({ outcome: cardReviews.outcome, cardId: cardReviews.cardId })
          .from(cardReviews)
          .innerJoin(cards, eq(cards.id, cardReviews.cardId))
          .where(and(eq(cardReviews.userId, userId), eq(cards.topicSlug, meta.topic)))
          .orderBy(asc(cardReviews.createdAt));
        retire = topicMastered(answers.map((a) => ({ outcome: a.outcome as Outcome, cardId: a.cardId })));
      }
      next = stretchCorrect(next, { rating, now, retire });
    }
    const values = {
      stability: next.stability,
      difficulty: next.difficulty,
      dueAt: next.dueAt.toISOString(),
      reps: next.reps,
      lapses: next.lapses,
      state: next.state,
      lastReview: next.lastReview?.toISOString() ?? null,
    };
    await tx
      .insert(cardState)
      .values({ userId, cardId, ...values })
      .onConflictDoUpdate({ target: [cardState.userId, cardState.cardId], set: values });
    // XP for a correct answer: 2 from a rule grader, 1 from the model, once a card a day and
    // within the day's caps (awardXp). The reader's own day, so a late-night answer counts there.
    const award = cardAward({ cardId, outcome, gradedBy });
    const xp = award ? await awardXp(tx, userId, localDate(await timezoneOf(userId, tx), now), award) : 0;
    return { state: next, xp };
  });
}

/**
 * Grades and records an answer: skip → 0; a self-rate → got/missed;
 * a shaped answer → the pure grader for its shape; a legacy typed answer → exact
 * or key-point match (never AI). A legacy typed answer that does not match asks
 * the user to mark it themselves. A correct main answer on a card with a
 * why-step returns `needsWhyStep` instead of a result, so the reader sends the
 * reason and the card is graded once. Null: no such live card. An answer whose
 * clientId was already recorded returns `duplicate` and saves nothing, so a
 * retried offline answer counts once.
 */
export async function answerCard(
  userId: string,
  input: AnswerInput,
  q: Db = db,
  store: FeedStore = redisStore(),
  now = new Date(),
): Promise<AnswerResult | { ungradable: true } | { needsWhyStep: true } | { duplicate: true } | null> {
  const claimed = input.clientId ? answerKey(userId, input.clientId) : null;
  if (claimed && !(await store.claim(claimed, ANSWER_ID_TTL))) return { duplicate: true };
  try {
    const result = await gradeAndSave(userId, input, q, store, now);
    // Nothing was saved in these cases, so the same input may be sent again.
    if (claimed && (!result || "ungradable" in result || "needsWhyStep" in result)) await store.del(claimed);
    return result;
  } catch (e) {
    if (claimed) await store.del(claimed).catch(() => undefined);
    throw e;
  }
}

/**
 * Put specific cards at the front of the reader's feed. Returns the ids that
 * will actually be served, which is not always the ids asked for.
 *
 * The Coach wrote this by hand (`lib/coach/act.ts`) with its own copy of the key,
 * the TTL and the entry encoding, and the copy had drifted in ways nothing could
 * catch, because that path had no test at all:
 *
 *  - It never cleared `currentKey`. `nextCard` serves the card already on screen
 *    before it looks at the queue, so "added to the front of your feed" was off
 *    by one card whenever the reader had one open.
 *  - It checked only that a card was live, not that it was in an area the reader
 *    has switched on. `nextCard` then drops out-of-area cards silently, so the
 *    Coach could confirm "3 cards added" and serve none of them.
 *  - It removed existing copies with `LREM` on the exact serialised string, so
 *    adding a field to `QueueItem` or reordering it would silently duplicate
 *    cards with no type error.
 */
export async function queueFirst(userId: string, cardIds: string[], q: Db = db, store: FeedStore = redisStore()): Promise<string[]> {
  if (!cardIds.length) return [];
  const areas = new Set<string>(await feedAreas(userId, q));
  // Live, visible, and in an area the reader actually reads.
  const rows = (await servable(cardIds, q)).filter((row) => areas.has(row.area));
  const ids = cardIds.filter((id) => rows.some((row) => row.id === id));
  if (!ids.length) return [];

  const queue = queueKey(userId);
  // Every reason, because a card already queued as "due" must not come back a
  // second time as "weak". REASONS is the canonical list rather than a retyped
  // one, so a new reason cannot be forgotten here.
  for (const id of ids) {
    for (const reason of REASONS) await store.remove(queue, JSON.stringify({ id, reason }));
  }
  // The card on screen is served before the queue, so it has to be cleared or
  // these would come after it. Clearing it alone dropped it: an unanswered card
  // the reader was part-way through vanished from the session, and a reload
  // showed the coach's card instead. Put it back at the head, behind the new
  // ones, so the reader gets these next and then returns to where they were.
  //
  // The sequential case is already safe: `answerCard` clears `current` itself, so
  // a reader who answers and then confirms a coach proposal has nothing to
  // displace. A concurrent interleave - this read landing before answerCard's
  // delete - could still put an answered card back, and `nextCard` checks a
  // queued card is servable and in area, not that it is unanswered. Left as is:
  // the cost is one repeated question on an answer path that is already
  // idempotent, and every guard tried here either could not be reproduced in a
  // test or moved the check somewhere it would run on every pop.
  const onScreen = parseQueueItem(await store.get(currentKey(userId)));
  const displaced = onScreen && !ids.includes(onScreen.id) ? [JSON.stringify(onScreen)] : [];
  await store.unshift(queue, [...ids.map((id) => JSON.stringify({ id, reason: "weak" })), ...displaced], QUEUE_TTL);
  await store.del(currentKey(userId));
  return ids;
}

/** The card on screen could not be graded and the reader moves on: it leaves the screen unanswered
 *  and goes to the back of their queue, so it is served again later rather than straight away. */
export async function deferCard(
  userId: string,
  cardId: string,
  q: Db = db,
  store: FeedStore = redisStore(),
  now = new Date(),
): Promise<void> {
  const current = parseQueueItem(await store.get(currentKey(userId)));
  if (current?.id !== cardId) return;
  // Top the queue up first, with this card still pinned so the refill leaves it out; it then
  // lands behind the fresh cards instead of being the only thing in the queue.
  const areas = await feedAreas(userId, q);
  if (areas.length) await refill(userId, areas, undefined, now, q, store);
  await store.push(queueKey(userId), [JSON.stringify(current)], QUEUE_TTL);
  await store.del(currentKey(userId));
}

async function gradeAndSave(
  userId: string,
  input: AnswerInput,
  q: Db,
  store: FeedStore,
  now: Date,
): Promise<AnswerResult | { ungradable: true } | { needsWhyStep: true } | null> {
  const [row] = await q
    .select({
      format: cards.format,
      promptMd: cards.promptMd,
      answerMd: cards.answerMd,
      keyPoints: cards.keyPoints,
      options: cards.options,
      picked: cards.picked,
      constraints: cards.constraints,
      pairs: cards.pairs,
      value: cards.value,
      tolerance: cards.tolerance,
      whyStep: cards.whyStep,
      sourceRefs: cards.sourceRefs,
      topicSlug: cards.topicSlug,
    })
    .from(cards)
    .where(and(eq(cards.id, input.cardId), eq(cards.status, "live")));
  if (!row) return null;
  const primitive = isPrimitive(row.format) ? row.format : null;
  const card: CardForGrading = {
    answer: cardAnswerOf(primitive, row),
    legacy: { answer: row.answerMd, keyPoints: stringList(row.keyPoints) },
  };

  // A declaration is a statement about the reader, not about the card: it
  // carries no answer and no score, so it never reaches the grader.
  let graded: Graded;
  let declared: "new_to_me" | undefined;
  if ("declare" in input) {
    declared = input.declare;
    graded = { score: 0, gradedBy: "declared", pointsHit: null, answer: "" };
  } else if (primitive === "compose" && "answer" in input) {
    // The one primitive a pure function cannot mark: the answer is the reader's
    // own words. `gradeWithAi` scores it per stored key point, and returns
    // `unavailable` when the rate limit trips or the model's output is unusable;
    // the answer is then not recorded, and the reader is told and moves on.
    const ai = await gradeWithAi({
      userId,
      prompt: row.promptMd,
      answer: input.answer,
      referenceAnswer: row.answerMd,
      keyPoints: card.legacy.keyPoints,
    });
    if ("unavailable" in ai) return { ungradable: true };
    graded = {
      score: ai.hits.filter(Boolean).length / ai.hits.length,
      gradedBy: "ai",
      pointsHit: ai.hits,
      answer: input.answer,
    };
  } else {
    const result = grade(input, card);
    if ("ungradable" in result || "needsWhyStep" in result) return result;
    graded = result;
  }

  const diagnostic = parseDiagnostic(await store.get(diagnosticKey(userId)));
  const inDiagnostic = diagnostic?.ids.includes(input.cardId) ?? false;
  const skipped = "skipped" in input;
  const { state, xp } = await saveAnswer(userId, input.cardId, graded, { diagnostic: inDiagnostic, skipped, declared }, now, q);

  let dayBonus = 0;
  try {
    dayBonus = await onCardAnswered(userId, q, now);
  } catch (e) {
    // The answer is saved; a missed mission tick is fixed by the next answer.
    console.error("card mission not ticked", e);
  }

  const current = parseQueueItem(await store.get(currentKey(userId)));
  if (current?.id === input.cardId) await store.del(currentKey(userId));

  let diagnosticSummary: AreaSummary[] | null = null;
  if (diagnostic && inDiagnostic) {
    const ids = diagnostic.ids.filter((id) => id !== input.cardId);
    if (ids.length) await store.set(diagnosticKey(userId), JSON.stringify({ ids, total: diagnostic.total }), DIAGNOSTIC_TTL);
    else diagnosticSummary = await finishDiagnostic(userId, q, store, now);
  }

  // The result's option list (with correct/picked highlighting) is only
  // meaningful for a chosen-shape answer; ordered and mapping cards explain
  // themselves in answerMd and the key points.
  const options = card.answer?.shape === "chosen" ? stringList(row.options) : [];
  const correctOption = card.answer?.shape === "chosen" && card.answer.picked.length === 1 ? (card.answer.picked[0] ?? null) : null;
  return {
    score: graded.score,
    outcome: declared ?? outcomeOf(graded.score, skipped),
    pointsHit: graded.pointsHit,
    answerMd: card.legacy.answer,
    keyPoints: card.legacy.keyPoints,
    options: options.length ? options : null,
    correctOption,
    // Safe only here: the card has just been answered, so revealing the answer's
    // shape costs nothing. `whyStep` is dropped - it is a second question with
    // its own component, and the review never draws it.
    submitted: "shape" in input ? (input as Answer) : null,
    correct: correctAnswer(card.answer),
    content: parseOptions(isPrimitive(row.format ?? "") ? (row.format as Primitive) : null, row.options),
    sourceRefs: sourceLinks(row.sourceRefs),
    why: card.answer?.whyStep
      ? {
          options: card.answer.whyStep.options,
          correct: card.answer.whyStep.correct,
          picked: "why" in input && typeof input.why === "number" ? input.why : null,
        }
      : null,
    nextDue: state.dueAt.toISOString(),
    xp,
    dayBonus,
    diagnosticSummary,
  };
}

/** Offer the diagnostic until it is done or skipped, once there are live cards to ask. */
export async function diagnosticState(userId: string, q: Db = db, store: FeedStore = redisStore()): Promise<"offer" | "running" | "done"> {
  const [profile] = await q.select({ doneAt: profiles.diagnosticDoneAt }).from(profiles).where(eq(profiles.userId, userId));
  if (profile?.doneAt) return "done";
  if (parseDiagnostic(await store.get(diagnosticKey(userId)))) return "running";
  return (await liveCardCount(FEED_AREAS, q)) ? "offer" : "done";
}

async function markDiagnosticDone(userId: string, q: Db, now = new Date()) {
  await q.update(profiles).set({ diagnosticDoneAt: now.toISOString() }).where(eq(profiles.userId, userId));
}

async function finishDiagnostic(userId: string, q: Db, store: FeedStore, now = new Date()): Promise<AreaSummary[]> {
  await markDiagnosticDone(userId, q, now);
  await store.del(diagnosticKey(userId));
  const rows = await q
    .select({ area: topics.domain, outcome: cardReviews.outcome })
    .from(cardReviews)
    .innerJoin(cards, eq(cards.id, cardReviews.cardId))
    .innerJoin(topics, eq(topics.slug, cards.topicSlug))
    .where(and(eq(cardReviews.userId, userId), eq(cardReviews.diagnostic, true)));
  return summarizeDiagnostic(rows);
}

/**
 * Picks ~20 cards (4 per area, easiest first) across all five areas, whatever
 * the Feed toggles say: the diagnostic seeds readiness for every area.
 * Returns the first card, or null when there is nothing to ask.
 */
export async function startDiagnostic(userId: string, q: Db = db, store: FeedStore = redisStore()): Promise<CardView | null> {
  const state = await diagnosticState(userId, q, store);
  if (state === "running") return nextCard(userId, q, store);
  if (state === "done") return null;
  const [pool, answered] = await Promise.all([
    q
      .select({ id: cards.id, area: topics.domain, difficulty: cards.difficulty, topic: topics.slug })
      .from(cards)
      .innerJoin(topics, eq(topics.slug, cards.topicSlug))
      .where(and(LIVE, inArray(topics.domain, [...FEED_AREAS]), cardProblemListed)),
    // The offer is a banner above live cards: anything already answered there is not asked again.
    q.selectDistinct({ id: cardReviews.cardId }).from(cardReviews).where(eq(cardReviews.userId, userId)),
  ]);
  type Difficulty = Parameters<typeof pickDiagnostic>[0][number]["difficulty"];
  const ids = pickDiagnostic(
    pool.map((card) => ({ ...card, difficulty: card.difficulty as Difficulty })),
    DIAGNOSTIC_PER_AREA,
    seedFromId(userId),
    new Set(answered.map((row) => row.id)),
  );
  if (!ids.length) {
    await markDiagnosticDone(userId, q);
    return null;
  }
  await store.set(diagnosticKey(userId), JSON.stringify({ ids, total: ids.length }), DIAGNOSTIC_TTL);
  return nextCard(userId, q, store);
}

export async function skipDiagnostic(userId: string, q: Db = db, store: FeedStore = redisStore()) {
  await markDiagnosticDone(userId, q);
  await store.del(diagnosticKey(userId));
}

/** Today's answers (in the user's time zone) and open missions, for the side panel and the Today banner. */
export async function sessionStats(userId: string, q: Db = db, now = new Date()): Promise<SessionStats> {
  const [profile] = await q.select({ timezone: profiles.timezone }).from(profiles).where(eq(profiles.userId, userId));
  const tz = profile?.timezone ?? "UTC";
  const today = localDate(tz, now);
  const [[answers], [open]] = await Promise.all([
    q
      .select({
        answered: sql<number>`count(*) filter (where ${cardReviews.outcome} in ('correct', 'wrong'))::int`,
        correct: sql<number>`count(*) filter (where ${cardReviews.outcome} = 'correct')::int`,
        skipped: sql<number>`count(*) filter (where ${cardReviews.outcome} in ('skipped', 'new_to_me'))::int`,
      })
      .from(cardReviews)
      .where(and(eq(cardReviews.userId, userId), sql`(${cardReviews.createdAt} at time zone ${tz})::date = ${today}::date`)),
    q
      .select({ n: sql<number>`count(*)::int` })
      .from(missions)
      .where(
        and(
          eq(missions.userId, userId),
          eq(missions.date, today),
          eq(missions.status, "open"),
          eq(missions.isRevive, false),
          eq(missions.isExtra, false),
        ),
      ),
  ]);
  return { answered: answers?.answered ?? 0, correct: answers?.correct ?? 0, skipped: answers?.skipped ?? 0, openMissions: open?.n ?? 0 };
}
