import type { CardView } from "@/lib/feed/view";
import { cardsNeedRefresh, flushOutbox, type FlushSummary, pendingFor } from "./outbox";
import { dropCard, loadCards, outboxItems, queueAnswer, removeAnswer, saveCards } from "./store";

// Browser side of the offline Feed. The app layout and the Feed both call
// these on open and on reconnect; a call made while one is running joins it,
// so an answer is never sent twice at once.

type Submit = Parameters<typeof flushOutbox>[1]["submit"];

let sending: Promise<FlushSummary> | null = null;
let refreshing: Promise<void> | null = null;

/** Sends this user's queued answers through submitAnswer, oldest first. */
export function sendQueuedAnswers(userId: string, submit: Submit): Promise<FlushSummary> {
  sending ??= (async () => {
    try {
      const items = pendingFor(await outboxItems(), userId);
      return await flushOutbox(items, {
        submit,
        // Its card goes from the saved copy too, or the next offline spell would serve it again.
        remove: async (item) => {
          await dropCard(userId, item.input.cardId);
          await removeAnswer(item.clientId);
        },
        save: async (item) => {
          await queueAnswer(item);
        },
      });
    } finally {
      sending = null;
    }
  })();
  return sending;
}

/**
 * Keeps the next ~30 cards on the device, fetching again only when there is
 * no copy or it is old, or with `topUp` when it runs short (see cardsNeedRefresh).
 */
export function refreshCards(
  userId: string,
  fetchCards: () => Promise<{ cards: CardView[] } | { error: string }>,
  options: { topUp?: boolean } = {},
): Promise<void> {
  refreshing ??= (async () => {
    try {
      if (!cardsNeedRefresh(await loadCards(userId), Date.now(), options)) return;
      const state = await fetchCards();
      if ("cards" in state) await saveCards(userId, state.cards);
    } catch {
      // Offline or the server said no: keep the copy there is.
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}
