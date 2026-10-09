import "server-only";
import { randomUUID } from "node:crypto";
import { and, desc, eq, isNull, lt, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { coachMessages, coachThreads } from "@/db/schema";
import { logError } from "@/lib/log";
import type { Db } from "@/lib/tracker/service";
import { type Citation, isQuiet, transcriptOf } from "./chat-rules";
import { extractMemory } from "./memory";
import type { CoachKind } from "./mode";

// Coach threads and their messages. Owner-only data: every query here is scoped to the user id the caller passes,
// which is always the signed-in viewer.

export type Thread = {
  id: string;
  kind: CoachKind;
  title: string;
  ref: string | null;
  updatedAt: string;
  memoryExtractedAt: string | null;
};

export type StoredMessage = { id: string; role: "user" | "assistant"; parts: unknown[] };

const THREAD_COLUMNS = {
  id: coachThreads.id,
  kind: coachThreads.kind,
  title: coachThreads.title,
  ref: coachThreads.ref,
  updatedAt: coachThreads.updatedAt,
  memoryExtractedAt: coachThreads.memoryExtractedAt,
};

const asThread = (row: Omit<Thread, "kind"> & { kind: string }): Thread => ({ ...row, kind: row.kind as CoachKind });

/** Recent threads that have at least one message, newest first. */
export async function listThreads(userId: string, limit = 20, q: Db = db): Promise<Thread[]> {
  const rows = await q
    .select(THREAD_COLUMNS)
    .from(coachThreads)
    .where(
      and(
        eq(coachThreads.userId, userId),
        ne(coachThreads.kind, "add"),
        sql`exists (select 1 from ${coachMessages} m where m.thread_id = ${coachThreads.id} and m.user_id = ${userId})`,
      ),
    )
    .orderBy(desc(coachThreads.updatedAt))
    .limit(limit);
  return rows.map(asThread);
}

export async function getThread(userId: string, id: string, q: Db = db): Promise<Thread | null> {
  const [row] = await q
    .select(THREAD_COLUMNS)
    .from(coachThreads)
    .where(and(eq(coachThreads.id, id), eq(coachThreads.userId, userId)));
  return row ? asThread(row) : null;
}

/** The latest thread about the same thing (a mock, a review, a pattern), so a link opens it again. */
export async function findThread(userId: string, kind: CoachKind, ref: string, q: Db = db): Promise<Thread | null> {
  const [row] = await q
    .select(THREAD_COLUMNS)
    .from(coachThreads)
    .where(and(eq(coachThreads.userId, userId), eq(coachThreads.kind, kind), eq(coachThreads.ref, ref)))
    .orderBy(desc(coachThreads.updatedAt))
    .limit(1);
  return row ? asThread(row) : null;
}

/** Today's Add with Coach thread, made on first use. One per user per local day, even with two tabs. */
export async function findOrCreateDayThread(userId: string, day: string, q: Db = db): Promise<Thread & { created: boolean }> {
  return q.transaction(async (tx) => {
    await lockAdd(userId, tx);
    const found = await findThread(userId, "add", day, tx);
    if (found) return { ...found, created: false };
    const made = await ensureThread(userId, { id: randomUUID(), kind: "add", ref: day, title: "Add with Coach" }, tx);
    if (!made) throw new Error("add thread not created");
    return { ...made, created: true };
  });
}

/** One Add with Coach writer per user at a time: find-or-create of the day's thread and saving an answer both take it. */
export async function lockAdd(userId: string, tx: Db): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`coach-add:${userId}`}))`);
}

/** The latest earlier day's add thread whose memory has not been extracted yet, if any. */
export async function previousAddThread(userId: string, day: string, q: Db = db): Promise<Thread | null> {
  const [row] = await q
    .select(THREAD_COLUMNS)
    .from(coachThreads)
    .where(
      and(eq(coachThreads.userId, userId), eq(coachThreads.kind, "add"), lt(coachThreads.ref, day), isNull(coachThreads.memoryExtractedAt)),
    )
    .orderBy(desc(coachThreads.ref))
    .limit(1);
  return row ? asThread(row) : null;
}

/**
 * The thread with this id, created for the user if it doesn't exist yet. The
 * client picks the id of a new thread, so a taken id (another user's thread)
 * comes back null rather than being reused.
 */
/** Who owns this thread, or null if there is no such thread.
 *
 *  Null is a real answer rather than a refusal: the client picks a thread's id
 *  before sending its first message, so a Stop pressed during that first request
 *  can arrive before the row exists. Telling the two apart lets the caller accept
 *  that case and still refuse somebody else's conversation. */
export async function threadOwner(threadId: string, q: Db = db): Promise<string | null> {
  const [row] = await q.select({ userId: coachThreads.userId }).from(coachThreads).where(eq(coachThreads.id, threadId));
  return row?.userId ?? null;
}

export async function ensureThread(
  userId: string,
  thread: { id: string; kind: CoachKind; ref: string | null; title: string },
  q: Db = db,
): Promise<Thread | null> {
  await q
    .insert(coachThreads)
    .values({ userId, ...thread })
    .onConflictDoNothing();
  return getThread(userId, thread.id, q);
}

/** The last `limit` messages, oldest first. */
export async function threadMessages(userId: string, threadId: string, limit = 30, q: Db = db): Promise<StoredMessage[]> {
  const rows = await q
    .select({ id: coachMessages.id, role: coachMessages.role, parts: coachMessages.parts })
    .from(coachMessages)
    .where(and(eq(coachMessages.threadId, threadId), eq(coachMessages.userId, userId)))
    .orderBy(desc(coachMessages.createdAt), desc(coachMessages.id))
    .limit(limit);
  return rows.toReversed().map((r) => ({
    id: r.id,
    role: r.role === "assistant" ? "assistant" : "user",
    parts: Array.isArray(r.parts) ? r.parts : [],
  }));
}

export async function saveMessage(userId: string, threadId: string, message: StoredMessage & { citations?: Citation[] }, q: Db = db) {
  // Idempotent by id. A coach answer can be saved by whichever finishes first -
  // the stream ending normally, or the background reader that covers a client
  // that left - and the loser must be a no-op rather than a primary-key error.
  await q
    .insert(coachMessages)
    .values({
      id: message.id,
      threadId,
      userId,
      role: message.role,
      parts: message.parts,
      citations: message.citations ?? [],
    })
    .onConflictDoNothing({ target: coachMessages.id });
  await q
    .update(coachThreads)
    .set({ updatedAt: sql`now()` })
    .where(and(eq(coachThreads.id, threadId), eq(coachThreads.userId, userId)));
}

const TRANSCRIPT_MESSAGES = 200;

/**
 * Extract lasting facts from a finished thread into coach memory, once: the
 * thread is claimed by setting memory_extracted_at first, so a second call (a
 * second tab, "End" after a quiet visit) does nothing.
 */
export async function extractThread(userId: string, threadId: string, q: Db = db): Promise<boolean> {
  const claimed = await q
    .update(coachThreads)
    .set({ memoryExtractedAt: sql`now()` })
    .where(and(eq(coachThreads.id, threadId), eq(coachThreads.userId, userId), isNull(coachThreads.memoryExtractedAt)))
    .returning({ id: coachThreads.id });
  if (!claimed.length) return false;
  const transcript = transcriptOf(
    (await threadMessages(userId, threadId, TRANSCRIPT_MESSAGES, q)) as { role: string; parts: { type: string }[] }[],
  );
  if (transcript) await extractMemory(userId, { kind: "thread", id: threadId }, transcript);
  return true;
}

/**
 * On a visit to Coach: threads that went quiet without being extracted get
 * extracted now. Mock threads are skipped; their scoring extracts
 * from the transcript and the feedback together.
 */
export async function extractQuietThreads(userId: string, now = new Date(), q: Db = db) {
  const candidates = await q
    .select({ id: coachThreads.id, updatedAt: coachThreads.updatedAt })
    .from(coachThreads)
    .where(and(eq(coachThreads.userId, userId), isNull(coachThreads.memoryExtractedAt), ne(coachThreads.kind, "mock")))
    .orderBy(desc(coachThreads.updatedAt))
    .limit(10);
  for (const t of candidates.filter((c) => isQuiet(c.updatedAt, now)).slice(0, 3)) {
    try {
      await extractThread(userId, t.id, q);
    } catch (e) {
      logError("thread memory extraction failed", e);
    }
  }
}
