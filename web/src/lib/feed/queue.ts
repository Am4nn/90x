// The Feed queue: about 50% weak areas, 30% due reviews, 20% new,
// never two cards in a row on the same topic. A difficulty mix biases which
// cards enter the queue, never which intervals FSRS gives them.

import { DIFFICULTIES, type Difficulty, type DifficultyMix } from "./difficulty";

export type QueueCard = { id: string; topic: string; area: string; difficulty: Difficulty | null };
export type QueueReason = "weak" | "due" | "new";
export type QueueItem = { id: string; reason: QueueReason };

type Picked = { card: QueueCard; reason: QueueReason };

/** Every reason a card can be in the queue. Exported so nothing has to retype
 *  the list to search for entries - the Coach used to hardcode it. */
export const REASONS: QueueReason[] = ["weak", "due", "new"];

function targets(size: number): Record<QueueReason, number> {
  const weak = Math.round(size * 0.5);
  const due = Math.round(size * 0.3);
  return { weak, due, new: size - weak - due };
}

// Takes cards per pool up to its target, then tops up short pools from the
// others in order weak → due → new. A card in several pools goes to the first
// pool that picks it.
function pick(pools: Record<QueueReason, QueueCard[]>, size: number): Record<QueueReason, QueueCard[]> {
  const seen = new Set<string>();
  const picked: Record<QueueReason, QueueCard[]> = { weak: [], due: [], new: [] };
  const next: Record<QueueReason, number> = { weak: 0, due: 0, new: 0 };
  const take = (reason: QueueReason, limit: number) => {
    const pool = pools[reason];
    while (picked[reason].length < limit && next[reason] < pool.length) {
      const card = pool[next[reason]++];
      if (!card || seen.has(card.id)) continue;
      seen.add(card.id);
      picked[reason].push(card);
    }
  };
  const total = () => REASONS.reduce((sum, reason) => sum + picked[reason].length, 0);

  const target = targets(size);
  for (const reason of REASONS) take(reason, target[reason]);
  for (const reason of REASONS) take(reason, picked[reason].length + size - total());
  return picked;
}

// Spreads the pools through the queue in proportion (weak, due, weak, new, …)
// so a short session still gets the mix, keeping each pool's order.
function interleave(picked: Record<QueueReason, QueueCard[]>): Picked[] {
  const total = REASONS.reduce((sum, reason) => sum + picked[reason].length, 0);
  const used: Record<QueueReason, number> = { weak: 0, due: 0, new: 0 };
  const merged: Picked[] = [];
  for (let position = 1; position <= total; position++) {
    let best: QueueReason | null = null;
    let bestLag = -Infinity;
    for (const reason of REASONS) {
      const count = picked[reason].length;
      if (used[reason] >= count) continue;
      const lag = (count * position) / total - used[reason];
      if (lag > bestLag) [best, bestLag] = [reason, lag];
    }
    if (!best) break;
    const card = picked[best][used[best]++];
    if (card) merged.push({ card, reason: best });
  }
  return merged;
}

// Whether `counts` (n cards left) can still be laid out with no topic twice
// in a row, the first one differing from `previous`.
function canFinish(counts: Map<string, number>, n: number, previous: string | undefined): boolean {
  for (const [topic, count] of counts) {
    if (count > (topic === previous ? Math.floor(n / 2) : Math.ceil(n / 2))) return false;
  }
  return true;
}

// Greedy: the earliest card whose topic differs from the previous one and
// still leaves a repeat-free layout possible. When none exists, repeats are
// unavoidable; take the most common other topic to keep them few.
function nextIndex(remaining: Picked[], counts: Map<string, number>, previous: string | undefined): number {
  const countOf = (topic: string) => counts.get(topic) ?? 0;
  let fallback = -1;
  for (const [index, { card }] of remaining.entries()) {
    const { topic } = card;
    if (topic === previous) continue;
    const count = countOf(topic);
    counts.set(topic, count - 1);
    const fits = canFinish(counts, remaining.length - 1, topic);
    counts.set(topic, count);
    if (fits) return index;
    const fallbackTopic = remaining[fallback]?.card.topic;
    if (fallbackTopic === undefined || count > countOf(fallbackTopic)) fallback = index;
  }
  return fallback === -1 ? 0 : fallback;
}

function spreadTopics(items: Picked[], lastTopic: string | undefined): Picked[] {
  const remaining = [...items];
  const counts = new Map<string, number>();
  for (const { card } of remaining) counts.set(card.topic, (counts.get(card.topic) ?? 0) + 1);
  const ordered: Picked[] = [];
  let previous = lastTopic;
  while (remaining.length > 0) {
    const [item] = remaining.splice(nextIndex(remaining, counts, previous), 1);
    if (!item) break;
    counts.set(item.card.topic, (counts.get(item.card.topic) ?? 1) - 1);
    ordered.push(item);
    previous = item.card.topic;
  }
  return ordered;
}

/** Reorders one pool toward the target difficulty mix, keeping each difficulty's
 *  own order. Cards with no difficulty keep their place among themselves and are
 *  woven in without bias. The reorder only changes which cards enter the queue,
 *  never membership: every card stays in its pool, reachable behind the ones the
 *  mix favours. */
function biasPool(pool: QueueCard[], mix: DifficultyMix): QueueCard[] {
  if (pool.length < 2) return pool;
  const buckets = new Map<Difficulty | null, QueueCard[]>();
  for (const key of [...DIFFICULTIES, null] as const) buckets.set(key, []);
  for (const card of pool) buckets.get(card.difficulty)?.push(card);

  const total = pool.length;
  const unknown = buckets.get(null)!.length;
  const knownShare = (total - unknown) / total;
  const shares = new Map<Difficulty | null, number>([
    ["Easy", mix.easy * knownShare],
    ["Medium", mix.medium * knownShare],
    ["Hard", mix.hard * knownShare],
    [null, unknown / total],
  ]);

  const used = new Map<Difficulty | null, number>([...shares.keys()].map((key) => [key, 0]));
  const result: QueueCard[] = [];
  for (let position = 1; result.length < total; position++) {
    let best: Difficulty | null = null;
    let bestLag = -Infinity;
    for (const key of shares.keys()) {
      const bucket = buckets.get(key)!;
      if (used.get(key)! >= bucket.length) continue;
      const lag = shares.get(key)! * position - used.get(key)!;
      if (lag > bestLag) {
        bestLag = lag;
        best = key;
      }
    }
    if (best === null) break;
    const bucket = buckets.get(best)!;
    const index = used.get(best)!;
    result.push(bucket[index]!);
    used.set(best, index + 1);
  }
  return result;
}

export function buildQueue(input: {
  weak: QueueCard[];
  due: QueueCard[];
  fresh: QueueCard[];
  size?: number;
  lastTopic?: string;
  /** Target Easy/Medium/Hard shares for the queue. Omitted, the pool order is
   *  kept as-is. */
  mix?: DifficultyMix;
}): QueueItem[] {
  const size = Math.max(0, input.size ?? 30);
  // Bias the pools, not the queue order, so the reason priority and the
  // no-two-in-a-row guarantee survive whatever the mix favours.
  const weak = input.mix ? biasPool(input.weak, input.mix) : input.weak;
  const due = input.mix ? biasPool(input.due, input.mix) : input.due;
  const fresh = input.mix ? biasPool(input.fresh, input.mix) : input.fresh;
  const picked = pick({ weak, due, new: fresh }, size);
  return spreadTopics(interleave(picked), input.lastTopic).map(({ card, reason }) => ({ id: card.id, reason }));
}
