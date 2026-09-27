import "server-only";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { coachMemory } from "@/db/schema";
import type { Db } from "@/lib/tracker/service";
import { DISMISSED, type MemoryKind } from "./memory-rules";

// The user's own edits to what Coach knows: notes they add,
// corrections and deletions. Always scoped to the signed-in user's id.
// A fact the user wrote or corrected is marked source 'user'. A deleted fact
// is kept as 'dismissed' (never shown or prompted) so Coach doesn't learn it again.

export async function addFact(userId: string, kind: MemoryKind, text: string, q: Db = db) {
  await q.insert(coachMemory).values({ userId, kind, text, source: "user" });
}

/** Returns false when the fact isn't the user's (or is gone). */
export async function editFact(userId: string, id: string, change: { text: string; kind?: MemoryKind }, q: Db = db): Promise<boolean> {
  const rows = await q
    .update(coachMemory)
    // Edited by hand: the user just confirmed it, and any old expiry date may no longer match the text.
    .set({ ...change, source: "user", status: "active", lastSeenAt: new Date().toISOString(), expiresOn: null })
    .where(and(eq(coachMemory.id, id), eq(coachMemory.userId, userId), ne(coachMemory.status, DISMISSED)))
    .returning({ id: coachMemory.id });
  return rows.length > 0;
}

export async function deleteFact(userId: string, id: string, q: Db = db): Promise<boolean> {
  const rows = await q
    .update(coachMemory)
    .set({ status: DISMISSED, evidence: [], expiresOn: null })
    .where(and(eq(coachMemory.id, id), eq(coachMemory.userId, userId), ne(coachMemory.status, DISMISSED)))
    .returning({ id: coachMemory.id });
  return rows.length > 0;
}
