import "server-only";
import { and, asc, desc, eq, gte, inArray, lte, notInArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { cardReviews, cardState, cards, missions, problems, profiles, topics } from "@/db/schema";
import { seedFromId, stringList } from "@/lib/admin/review";
import {
  DAY_MS,
  MAX_ANSWER_CHARS,
  WEAK_WINDOW_DAYS,
  gradeCard,
  gradeSelfRate,
  outcomeOf,
  parseConstraints,
  parsePairs,
  parsePicked,
  parseWhyStep,
  scoreToRating,
  type Answer,
  type CardAnswer,
} from "@/lib/feed/grade";
import { patternMap } from "@/lib/library/queries";
import { localDate } from "@/lib/tracker/dates";
import { type Db, onCardAnswered } from "@/lib/tracker/service";
import { key } from "@/lib/upstash/keys";
import { redis } from "@/lib/upstash/redis";
import { shapeOf, type Primitive } from "./archetypes";
import { canDeclareKnown } from "./declare";
import { pickDiagnostic } from "./diagnostic";
import {
  difficultyMix,
  parseDifficulty,
  parseDifficultyPreference,
  parseLevel,
  type DifficultyMix,
  type DifficultyPreference,
} from "./difficulty";
import { optionsCount, parseOptions } from "./options";
import { buildQueue, type QueueCard, type QueueItem, REASONS } from "./queue";
import { nextState, type SrsState } from "./srs";
import {
  type AnswerInput,
  type AnswerResult,
  type AreaSummary,
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
/** Far enough out that a retired card leaves the rotation for this campaign. */
const RETIRED_DAYS = 365;
/** Anything due beyond this was retired, not merely scheduled far out. */
const RETIRED_FLOOR_MS = 180 * DAY_MS;
const QUEUE_TTL = 7 * 24 * 60 * 60;
const DIAGNOSTIC_TTL = 30 * 24 * 60 * 60;
// Guards the serve loop against a queue that is somehow all unservable.
const MAX_POPS = 100;

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

const queueKey = (userId: string) => key("feed", userId);
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

const LIVE = and(eq(cards.status, "live"), eq(cards.hidden, false));

const VIEW_COLUMNS = {
  id: cards.id,
  format: cards.format,
  archetype: cards.archetype,
  difficulty: cards.difficulty,
  promptMd: cards.promptMd,
  options: cards.options,
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

/** Reads the current feed_topics object once, so an area write and a difficulty
 *  write both preserve the other half of the jsonb instead of clobbering it. */
async function feedTopicsState(userId: string, q: Db): Promise<{ areas: FeedArea[]; difficulty: DifficultyPreference }> {
  const [row] = await q.select({ feedTopics: profiles.feedTopics }).from(profiles).where(eq(profiles.userId, userId));
  const value = row?.feedTopics ?? null;
  return { areas: parseFeedAreas(value), difficulty: parseDifficultyPreference(value) };
}

export async function setFeedAreas(userId: string, areas: FeedArea[], q: Db = db, store: FeedStore = redisStore()) {
  const { difficulty } = await feedTopicsState(userId, q);
  await q.update(profiles).set({ feedTopics: { areas, difficulty } }).where(eq(profiles.userId, userId));
  // The queue was picked for the old areas; the next card refills it.
  await store.del(queueKey(userId));
}

export async function setDifficultyPreference(
  userId: string,
  preference: DifficultyPreference,
  q: Db = db,
  store: FeedStore = redisStore(),
) {
  const { areas } = await feedTopicsState(userId, q);
  await q
    .update(profiles)
    .set({ feedTopics: { areas, difficulty: preference } })
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

async function pools(userId: string, areas: FeedArea[], now: Date, q: Db) {
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
  // Cards the reader retired with "I already know this". Their schedule is a
  // year out, which keeps them out of the due pool and the fresh pool, but the
  // weak pool selects on topic alone and would serve them again after the rest
  // window.
  const retired = q
    .select({ id: cardState.cardId })
    .from(cardState)
    .where(and(eq(cardState.userId, userId), gte(cardState.dueAt, new Date(now.getTime() + RETIRED_FLOOR_MS).toISOString())));
  const answeredLately = q
    .select({ id: cardReviews.cardId })
    .from(cardReviews)
    .where(and(eq(cardReviews.userId, userId), gte(cardReviews.createdAt, new Date(now.getTime() - REST_DAYS * DAY_MS).toISOString())));
  const seen = q.select({ id: cardState.cardId }).from(cardState).where(eq(cardState.userId, userId));
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
    .where(and(inAreas, notInArray(cards.id, seen)))
    .as("fresh");

  const [weak, fresh] = await Promise.all([
    ranked.length
      ? q
          .select(poolColumns)
          .from(cards)
          .innerJoin(topics, eq(topics.slug, cards.topicSlug))
          .where(and(inAreas, inArray(topics.slug, ranked), notInArray(cards.id, answeredLately), notInArray(cards.id, retired)))
          .orderBy(
            sql`array_position(array[${sql.join(
              ranked.map((slug) => sql`${slug}`),
              sql`, `,
            )}]::text[], ${topics.slug})`,
            asc(cards.createdAt),
          )
          .limit(WEAK_POOL)
      : [],
    q
      .select({ id: freshRanked.id, topic: freshRanked.topic, area: freshRanked.area, difficulty: freshRanked.difficulty })
      .from(freshRanked)
      .orderBy(asc(freshRanked.turn), desc(freshRanked.topicImportance), asc(freshRanked.topic))
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
  const eligible = await eligibleTopics(userId, [row.topicSlug], q);
  return cardView(row, "diagnostic", { index: total - ids.length + 1, total }, eligible.has(row.topicSlug));
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
    const [row] = await servable([item.id], q);
    const eligible = row ? await eligibleTopics(userId, [row.topicSlug], q) : new Set<string>();
    return row && inAreas(row.area) ? cardView(row, item.reason, null, eligible.has(row.topicSlug)) : null;
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
          const item = parseQueueItem(await store.pop(queueKey(userId)));
          if (!item) {
            if (refilled) break;
            await refill(userId, areas, undefined, now, q, store);
            refilled = true;
            continue;
          }
          const view = await serve(item);
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
    const eligible = await eligibleTopics(
      userId,
      [...rows.values()].map((r) => r.topicSlug),
      q,
    );
    return ids.flatMap((id, i) => {
      const row = rows.get(id);
      const view = row ? cardView(row, "diagnostic", { index: total - ids.length + 1 + i, total }, eligible.has(row.topicSlug)) : null;
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
  const eligible = await eligibleTopics(
    userId,
    [...rows.values()].map((r) => r.topicSlug),
    q,
  );
  return items.flatMap((item) => {
    const row = rows.get(item.id);
    const view = row && inAreas(row.area) ? cardView(row, item.reason, null, eligible.has(row.topicSlug)) : null;
    return view ? [view] : [];
  });
}

type Graded = {
  score: number;
  gradedBy: "skip" | "match" | "self" | "declared" | "pure";
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
): Graded | { needsSelfMark: true } | { needsWhyStep: true } {
  if ("skipped" in input) return { score: 0, gradedBy: "skip", pointsHit: null, answer: "" };
  if ("selfMark" in input) return { score: gradeSelfRate(input.selfMark), gradedBy: "self", pointsHit: null, answer: input.answer ?? "" };
  if ("shape" in input) {
    if (!card.answer) return { needsSelfMark: true };
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
  const given = legacyNormalize(input.answer);
  const exact = given !== "" && (given === legacyNormalize(card.legacy.answer) || matchesKeyPoints(given, card.legacy.keyPoints));
  if (!exact) return { needsSelfMark: true };
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
      return constraints && count ? { shape: "ordered", constraints, count, whyStep } : null;
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

/** Stores one review and moves the card's FSRS state, locking the state row so two tabs can't interleave. */
async function saveAnswer(
  userId: string,
  cardId: string,
  graded: Graded,
  flags: { diagnostic: boolean; skipped: boolean; declared?: "new_to_me" | "known" },
  now: Date,
  q: Db,
): Promise<SrsState> {
  return q.transaction(async (tx) => {
    await tx.insert(cardReviews).values({
      userId,
      cardId,
      answer: graded.answer.slice(0, MAX_ANSWER_CHARS),
      score: graded.score,
      pointsHit: graded.pointsHit ?? [],
      outcome: flags.declared ?? outcomeOf(graded.score, flags.skipped),
      gradedBy: flags.declared ? "declared" : graded.gradedBy,
      usedOptions: false,
      diagnostic: flags.diagnostic,
      createdAt: now.toISOString(),
    });
    const [prev] = await tx
      .select()
      .from(cardState)
      .where(and(eq(cardState.userId, userId), eq(cardState.cardId, cardId)))
      .for("update");
    // "New to me" brings the card back soon, like a miss; "I already know
    // this" pushes it out of rotation. Neither is a grade, so neither goes
    // through scoreToRating.
    const rating = flags.declared ? (flags.declared === "known" ? 4 : 1) : scoreToRating(graded.score, flags.skipped);
    const next = nextState(prev ? toSrs(prev) : null, rating, now);
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
    return next;
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
): Promise<AnswerResult | { needsSelfMark: true } | { needsWhyStep: true } | { duplicate: true } | { notEligible: true } | null> {
  const claimed = input.clientId ? answerKey(userId, input.clientId) : null;
  if (claimed && !(await store.claim(claimed, ANSWER_ID_TTL))) return { duplicate: true };
  try {
    const result = await gradeAndSave(userId, input, q, store, now);
    // Nothing was saved in these cases, so the same input may be sent again.
    if (claimed && (!result || "needsSelfMark" in result || "needsWhyStep" in result || "notEligible" in result)) await store.del(claimed);
    return result;
  } catch (e) {
    if (claimed) await store.del(claimed).catch(() => undefined);
    throw e;
  }
}

/** Topics where the reader has earned the right to retire cards.
 *
 * Batched: the Feed prefetches several cards, and asking per card would be a
 * pair of queries each. */
async function eligibleTopics(userId: string, slugs: string[], q: Db = db): Promise<Set<string>> {
  const wanted = [...new Set(slugs.filter(Boolean))];
  if (!wanted.length) return new Set();
  const [answers, counts] = await Promise.all([
    q
      .select({ topic: cards.topicSlug, outcome: cardReviews.outcome, cardId: cardReviews.cardId })
      .from(cardReviews)
      .innerJoin(cards, eq(cards.id, cardReviews.cardId))
      .where(and(eq(cardReviews.userId, userId), inArray(cards.topicSlug, wanted)))
      .orderBy(asc(cardReviews.createdAt)),
    q
      .select({ topic: cards.topicSlug, n: sql<number>`count(*)::int` })
      .from(cards)
      .where(and(inArray(cards.topicSlug, wanted), eq(cards.status, "live")))
      .groupBy(cards.topicSlug),
  ]);
  const byTopic = new Map(wanted.map((slug) => [slug, [] as { outcome: import("./grade").Outcome; cardId: string }[]]));
  for (const a of answers) {
    if (a.topic) byTopic.get(a.topic)?.push({ outcome: a.outcome as import("./grade").Outcome, cardId: a.cardId });
  }
  const cardCount = new Map(counts.flatMap((c) => (c.topic ? [[c.topic, c.n]] : [])));
  return new Set(wanted.filter((slug) => canDeclareKnown({ answers: byTopic.get(slug) ?? [], cardsInTopic: cardCount.get(slug) ?? 0 })));
}

/** What the reader has done on a card's topic, for the "I already know this" gate. */
async function topicRecord(userId: string, topicSlug: string | null, q: Db = db) {
  if (!topicSlug) return { answers: [], cardsInTopic: 0 };
  const [answers, [count]] = await Promise.all([
    q
      .select({ outcome: cardReviews.outcome, cardId: cardReviews.cardId })
      .from(cardReviews)
      .innerJoin(cards, eq(cards.id, cardReviews.cardId))
      .where(and(eq(cardReviews.userId, userId), eq(cards.topicSlug, topicSlug)))
      .orderBy(asc(cardReviews.createdAt)),
    q
      .select({ n: sql<number>`count(*)::int` })
      .from(cards)
      .where(and(eq(cards.topicSlug, topicSlug), eq(cards.status, "live"))),
  ]);
  return {
    answers: answers.map((a) => ({ outcome: a.outcome as import("./grade").Outcome, cardId: a.cardId })),
    cardsInTopic: count?.n ?? 0,
  };
}

/** How many cards in this topic the reader has not retired or answered yet.
 *
 * Offered once, never taken automatically: retiring eight cards on one tap is
 * a big invisible action, and they only earned the right by proving the topic. */
async function retireOffer(userId: string, topicSlug: string | null, q: Db) {
  if (!topicSlug) return null;
  const [topic] = await q.select({ name: topics.name }).from(topics).where(eq(topics.slug, topicSlug));
  const seen = q.select({ id: cardState.cardId }).from(cardState).where(eq(cardState.userId, userId));
  const [left] = await q
    .select({ n: sql<number>`count(*)::int` })
    .from(cards)
    .where(and(eq(cards.topicSlug, topicSlug), eq(cards.status, "live"), eq(cards.hidden, false), notInArray(cards.id, seen)));
  const remaining = left?.n ?? 0;
  return remaining > 0 ? { topicSlug, topicName: topic?.name ?? topicSlug, remaining } : null;
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

/** Retire every card in a topic the reader has not met yet. */
export async function retireTopic(userId: string, topicSlug: string, q: Db = db, now = new Date()): Promise<number> {
  if (!canDeclareKnown(await topicRecord(userId, topicSlug, q))) return 0;
  const far = new Date(now.getTime() + RETIRED_DAYS * DAY_MS);
  return q.transaction(async (tx) => {
    // Selected inside the transaction: two tabs retiring at once would
    // otherwise both record the same cards, and a card answered in between
    // would be marked known without its new schedule changing.
    const seen = tx.select({ id: cardState.cardId }).from(cardState).where(eq(cardState.userId, userId));
    const rest = await tx
      .select({ id: cards.id })
      .from(cards)
      .where(and(eq(cards.topicSlug, topicSlug), eq(cards.status, "live"), eq(cards.hidden, false), notInArray(cards.id, seen)))
      .for("update");
    if (!rest.length) return 0;
    await tx.insert(cardReviews).values(
      rest.map((c) => ({
        userId,
        cardId: c.id,
        answer: "",
        score: 0,
        pointsHit: [],
        outcome: "known",
        gradedBy: "declared",
        usedOptions: false,
        diagnostic: false,
        createdAt: now.toISOString(),
      })),
    );
    await tx
      .insert(cardState)
      .values(
        rest.map((c) => ({
          userId,
          cardId: c.id,
          stability: RETIRED_DAYS,
          difficulty: 1,
          dueAt: far.toISOString(),
          reps: 1,
          lapses: 0,
          state: 2,
          lastReview: now.toISOString(),
        })),
      )
      .onConflictDoNothing();
    return rest.length;
  });
}

async function gradeAndSave(
  userId: string,
  input: AnswerInput,
  q: Db,
  store: FeedStore,
  now: Date,
): Promise<AnswerResult | { needsSelfMark: true } | { needsWhyStep: true } | { notEligible: true } | null> {
  const [row] = await q
    .select({
      format: cards.format,
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
  if ("declare" in input && input.declare === "known" && !canDeclareKnown(await topicRecord(userId, row.topicSlug, q))) {
    return { notEligible: true };
  }
  const primitive = isPrimitive(row.format) ? row.format : null;
  const card: CardForGrading = {
    answer: cardAnswerOf(primitive, row),
    legacy: { answer: row.answerMd, keyPoints: stringList(row.keyPoints) },
  };

  // A declaration is a statement about the reader, not about the card: it
  // carries no answer and no score, so it never reaches the grader.
  let graded: Graded;
  let declared: "new_to_me" | "known" | undefined;
  if ("declare" in input) {
    declared = input.declare;
    graded = { score: 0, gradedBy: "declared", pointsHit: null, answer: "" };
  } else {
    const result = grade(input, card);
    if ("needsSelfMark" in result || "needsWhyStep" in result) return result;
    graded = result;
  }

  const diagnostic = parseDiagnostic(await store.get(diagnosticKey(userId)));
  const inDiagnostic = diagnostic?.ids.includes(input.cardId) ?? false;
  const skipped = "skipped" in input;
  const state = await saveAnswer(userId, input.cardId, graded, { diagnostic: inDiagnostic, skipped, declared }, now, q);

  try {
    await onCardAnswered(userId, q, now);
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
    sourceRefs: sourceLinks(row.sourceRefs),
    nextDue: state.dueAt.toISOString(),
    retireOffer: declared === "known" ? await retireOffer(userId, row.topicSlug, q) : null,
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
  const pool = await q
    .select({ id: cards.id, area: topics.domain, difficulty: cards.difficulty, topic: topics.slug })
    .from(cards)
    .innerJoin(topics, eq(topics.slug, cards.topicSlug))
    .where(and(LIVE, inArray(topics.domain, [...FEED_AREAS])));
  type Difficulty = Parameters<typeof pickDiagnostic>[0][number]["difficulty"];
  const ids = pickDiagnostic(
    pool.map((card) => ({ ...card, difficulty: card.difficulty as Difficulty })),
    DIAGNOSTIC_PER_AREA,
    seedFromId(userId),
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
        skipped: sql<number>`count(*) filter (where ${cardReviews.outcome} = 'skipped')::int`,
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
