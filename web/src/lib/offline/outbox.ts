import type { AnswerInput, CardView, SessionStats } from "@/lib/feed/view";

// Offline Feed: which saved card to show next, and how answers made
// offline reach the server. Pure, so it runs the same in tests and the browser.

/** An answer made offline, waiting in the browser to be graded on the server. */
export type OutboxItem = {
  clientId: string;
  userId: string;
  input: AnswerInput & { clientId: string };
  queuedAt: number;
};

export type SavedCards = { cards: CardView[]; savedAt: number };

/** What submitAnswer can answer with, as far as the outbox cares. */
type Submitted =
  | { result: unknown; session: SessionStats }
  | { duplicate: true }
  | { ungradable: true }
  | { needsWhyStep: true }
  /** `retry`: the server failed this time (not the answer's fault). */
  | { error: string; retry?: boolean };

export type FlushSummary = { graded: number; dropped: number; left: number; session: SessionStats | null };

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
 * Sends queued answers one at a time, oldest first. A network failure, a
 * server error or AI grading being down stops the run and keeps everything
 * left for the next one, so answers are never graded out of order. An answer
 * the server refuses for good (its card is gone, the input is invalid) is
 * dropped, so it can't hold the rest back.
 */
export async function flushOutbox(
  items: OutboxItem[],
  deps: {
    submit: (input: OutboxItem["input"]) => Promise<Submitted>;
    remove: (item: OutboxItem) => Promise<void>;
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
    if ("ungradable" in state || "needsWhyStep" in state || state.retry) {
      summary.left = items.length - index;
      return summary;
    }
    await deps.remove(item);
    summary.dropped++;
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
