import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { libraryGaps as gaps } from "@/db/schema";
import { logError } from "@/lib/log";
import { key } from "@/lib/upstash/keys";
import { redis } from "@/lib/upstash/redis";
import { topicBySlugOrName } from "./tools-data";

// The topics people ask Coach about that the Library has no lesson for (migration 052). Coach notes
// one through note_library_gap; /admin/reports lists them so the admin sees what the Library should
// cover. Only the topic phrase is kept: not the message, not who asked.

const DAY_SECONDS = 24 * 60 * 60;

// Letters, digits, a space and + # . - / ' & : enough for "c++", "ci/cd", "b-tree", "o'reilly".
const ALLOWED = /^[\p{L}\p{N} +#./'&-]+$/u;

/** The phrase as stored: trimmed, single-spaced, lowercase. Null when it is not a 2-80 character topic. */
export function normalizeGapTopic(raw: string): string | null {
  const topic = raw.trim().replace(/\s+/g, " ").toLowerCase();
  return topic.length >= 2 && topic.length <= 80 && ALLOWED.test(topic) ? topic : null;
}

/**
 * Counts one more ask for a topic. One person asking again the same UTC day adds nothing. Never
 * throws: a failure here must not break the chat, so it logs and reports `noted: false`.
 */
export async function noteLibraryGap(userId: string, raw: string): Promise<{ noted: boolean }> {
  const topic = normalizeGapTopic(raw);
  if (!topic) return { noted: false };
  const claim = key("coach", "gap", userId, topic, new Date().toISOString().slice(0, 10));
  try {
    const first = await redis().set(claim, "1", { nx: true, ex: DAY_SECONDS });
    if (first !== "OK") return { noted: true };
  } catch (e) {
    // Redis is only the dedupe; a repeat counted twice is better than a gap lost.
    logError("library gap dedupe failed", e);
  }
  try {
    const match = await topicBySlugOrName(topic, db, { anyDomain: true });
    await db
      .insert(gaps)
      .values({ topic, topicSlug: match?.slug ?? null })
      .onConflictDoUpdate({
        target: gaps.topic,
        set: {
          asks: sql`${gaps.asks} + 1`,
          lastAskedAt: sql`now()`,
          topicSlug: sql`coalesce(excluded.topic_slug, ${gaps.topicSlug})`,
        },
      });
    return { noted: true };
  } catch (e) {
    logError("library gap note failed", e);
    // Nothing was counted, so the day's claim must not swallow the next ask.
    await redis()
      .del(claim)
      .catch(() => undefined);
    return { noted: false };
  }
}

export type LibraryGap = {
  topic: string;
  topicSlug: string | null;
  asks: number;
  lastAskedAt: string;
  /** A lesson for topicSlug exists now, so the gap has been filled. */
  lessonExists: boolean;
};

/** For /admin/reports: the most asked first, then the most recently asked. */
export async function libraryGaps(limit = 30): Promise<LibraryGap[]> {
  return db
    .select({
      topic: gaps.topic,
      topicSlug: gaps.topicSlug,
      asks: gaps.asks,
      lastAskedAt: gaps.lastAskedAt,
      lessonExists: sql<boolean>`exists (select 1 from lessons l where l.topic_slug = ${gaps.topicSlug})`,
    })
    .from(gaps)
    .orderBy(desc(gaps.asks), desc(gaps.lastAskedAt))
    .limit(limit);
}

/** The admin has dealt with this topic. */
export async function clearLibraryGap(topic: string): Promise<void> {
  await db.delete(gaps).where(eq(gaps.topic, topic));
}
