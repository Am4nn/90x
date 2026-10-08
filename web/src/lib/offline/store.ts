import type { CardView } from "@/lib/feed/view";
import type { OutboxItem, SavedCards } from "./outbox";

// IndexedDB for the offline Feed: the next cards per user, and answers waiting
// to be graded. Browser only. Storage can be missing or full (private mode,
// quota), so every call catches and falls back instead of throwing.

const DB_NAME = "90x-offline";
const CARDS = "cards";
const OUTBOX = "outbox";

type CardsRow = SavedCards & { userId: string };

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.addEventListener("upgradeneeded", () => {
      request.result.createObjectStore(CARDS, { keyPath: "userId" });
      request.result.createObjectStore(OUTBOX, { keyPath: "clientId" });
    });
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error));
  });
}

async function run<T>(store: string, mode: IDBTransactionMode, work: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const request = work(tx.objectStore(store));
      tx.addEventListener("complete", () => resolve(request.result));
      tx.addEventListener("error", () => reject(tx.error));
      tx.addEventListener("abort", () => reject(tx.error));
    });
  } finally {
    db.close();
  }
}

async function safely<T>(what: string, fallback: T, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (e) {
    console.warn(`offline store: ${what} failed`, e);
    return fallback;
  }
}

export function loadCards(userId: string): Promise<SavedCards | null> {
  return safely("load cards", null, async () => {
    const row = (await run(CARDS, "readonly", (s) => s.get(userId))) as CardsRow | undefined;
    return row ? { cards: row.cards, savedAt: row.savedAt } : null;
  });
}

export function saveCards(userId: string, cards: CardView[]): Promise<void> {
  return safely("save cards", undefined, async () => {
    const row: CardsRow = { userId, cards, savedAt: Date.now() };
    await run(CARDS, "readwrite", (s) => s.put(row));
  });
}

/** Drops a card answered online, so it isn't served again offline before the next refresh. */
export function dropCard(userId: string, cardId: string): Promise<void> {
  return safely("drop card", undefined, async () => {
    const saved = await loadCards(userId);
    if (!saved?.cards.some((card) => card.id === cardId)) return;
    const row: CardsRow = { userId, cards: saved.cards.filter((card) => card.id !== cardId), savedAt: saved.savedAt };
    await run(CARDS, "readwrite", (s) => s.put(row));
  });
}

/** Signed out: the saved cards go. Queued answers stay, tagged with their user, and send when that user is back.
 *  True once they are gone (or there was no store to clear), false when clearing failed. */
export function forgetCards(): Promise<boolean> {
  return safely("forget cards", false, async () => {
    await run(CARDS, "readwrite", (s) => s.clear());
    return true;
  });
}

/** False when the answer couldn't be stored, so the screen can say so instead of losing it. */
export function queueAnswer(item: OutboxItem): Promise<boolean> {
  return safely("queue answer", false, async () => {
    await run(OUTBOX, "readwrite", (s) => s.put(item));
    return true;
  });
}

export function outboxItems(): Promise<OutboxItem[]> {
  return safely("read outbox", [], async () => (await run(OUTBOX, "readonly", (s) => s.getAll())) as OutboxItem[]);
}

export function removeAnswer(clientId: string): Promise<void> {
  return safely("remove answer", undefined, async () => {
    await run(OUTBOX, "readwrite", (s) => s.delete(clientId));
  });
}
