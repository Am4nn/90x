import type { AnswerInput, CardView, SessionStats } from "@/lib/feed/view";

// Offline Feed: which saved card to show next, and how answers made
// offline reach the server. Pure, so it runs the same in tests and the browser.

/** An answer made offline, waiting in the browser to be graded on the server. */
export type OutboxItem = {
  clientId: string;
  userId: string;
  input: AnswerInput & { clientId: string };
  queuedAt: number;
  attempts: number;
};

export type SavedCards = { cards: CardView[]; savedAt: number };

/** What submitAnswer can answer with, as far as the outbox cares. */
type Submitted = { result: unknown; session: SessionStats } | { duplicate: true } | { needsSelfMark: true } | { error: string };

export type FlushSummary = { graded: number; dropped: number; left: number; session: SessionStats | null };

/** A refused answer is tried this many times, then dropped, so one bad answer can't hold the rest back for good. */
export const MAX_ATTEMPTS = 3;
const REFRESH_AFTER_MS = 30 * 60_000;
const TOP_UP_BELOW = 15;
/** A short copy is topped up at most this often: a small card pool can't fill it anyway. */
const TOP_UP_AFTER_MS = 2 * 60_000;

export function pendingFor(items: OutboxItem[], userId: string): OutboxItem[] {
  return items.filter((item) => item.userId === userId).toSorted((a, b) => a.queuedAt - b.queuedAt);
}

export function nextOfflineCard(cards: CardView[], answeredIds: string[]): CardView | null {
  const answered = new Set(answeredIds);
  return cards.find((card) => !answered.has(card.id)) ?? null;
}

/**
 * Fetch again when there is no copy or it is old. With `topUp` (the Feed, as
 * cards get answered) also when the copy runs short, but not more than every
 * couple of minutes.
 */
export function cardsNeedRefresh(saved: SavedCards | null, now: number, { topUp = false } = {}): boolean {
  if (!saved) return true;
  const age = now - saved.savedAt;
  return age > REFRESH_AFTER_MS || (topUp && saved.cards.length < TOP_UP_BELOW && age > TOP_UP_AFTER_MS);
}

/**
 * Sends queued answers one at a time, oldest first. A network failure stops
 * the run and keeps everything left; a refused answer (no card, grading down)
 * also stops it, so answers are never graded out of order, and is dropped
 * after MAX_ATTEMPTS runs.
 */
export async function flushOutbox(
  items: OutboxItem[],
  deps: {
    submit: (input: OutboxItem["input"]) => Promise<Submitted>;
    remove: (item: OutboxItem) => Promise<void>;
    save: (item: OutboxItem) => Promise<void>;
  },
): Promise<FlushSummary> {
  const summary: FlushSummary = { graded: 0, dropped: 0, left: 0, session: null };
  for (const [index, item] of items.entries()) {
    let state: Submitted;
    try {
      state = await deps.submit(item.input);
    } catch {
      summary.left = items.length - index;
      return summary;
    }
    if ("result" in state || "duplicate" in state) {
      await deps.remove(item);
      summary.graded++;
      if ("session" in state) summary.session = state.session;
      continue;
    }
    const attempts = item.attempts + 1;
    if (attempts >= MAX_ATTEMPTS) {
      await deps.remove(item);
      summary.dropped++;
      continue;
    }
    await deps.save({ ...item, attempts });
    summary.left = items.length - index;
    return summary;
  }
  return summary;
}

const answers = (n: number) => `${n} ${n === 1 ? "answer" : "answers"}`;

export function syncedLine({ graded, dropped }: FlushSummary): string | null {
  if (graded && dropped) return `${answers(graded)} graded. ${dropped} couldn't be graded.`;
  if (graded) return `${answers(graded)} graded`;
  if (dropped) return `${dropped} offline ${dropped === 1 ? "answer" : "answers"} couldn't be graded.`;
  return null;
}
