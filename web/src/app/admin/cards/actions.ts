"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/components/form";
import { db } from "@/db";
import { batchReviewItems, cardBatches, cardFlags, cards } from "@/db/schema";
import { sampleIds } from "@/lib/admin/cards";
import { reviewProgress } from "@/lib/admin/review";
import { adminViewer } from "@/lib/auth/viewer";
import { logError } from "@/lib/log";

// Batch review and flag decisions. The server connection bypasses RLS, so
// each action opens with adminViewer().

const DENIED: FormState = { error: "Only admins can do that." };

function refresh(batchId?: string) {
  revalidatePath("/admin/cards");
  if (batchId) revalidatePath(`/admin/cards/${batchId}`);
}

const VerdictInput = z.object({
  batchId: z.uuid(),
  cardId: z.uuid(),
  verdict: z.enum(["good", "bad"]),
  note: z.string().trim().max(500).optional(),
});

class Refused extends Error {}

export async function recordVerdict(batchId: string, cardId: string, verdict: "good" | "bad", note?: string): Promise<FormState> {
  const viewer = await adminViewer();
  if (!viewer) return DENIED;
  const parsed = VerdictInput.safeParse({ batchId, cardId, verdict, note });
  if (!parsed.success) return { error: "That verdict isn't valid." };
  const input = parsed.data;

  try {
    const outcome = await db.transaction(async (tx) => {
      // Lock the batch so two verdicts landing together decide it once.
      const [batch] = await tx
        .select({ status: cardBatches.status })
        .from(cardBatches)
        .where(eq(cardBatches.id, input.batchId))
        .for("update");
      if (!batch) throw new Refused("That batch no longer exists.");
      if (batch.status !== "draft") throw new Refused("This batch is already decided.");

      const sample = await sampleIds(input.batchId, tx);
      if (!sample.includes(input.cardId)) throw new Refused("That card isn't in this batch's sample.");

      const decision = { verdict: input.verdict, note: input.note || null, decidedBy: viewer.id, createdAt: new Date().toISOString() };
      await tx
        .insert(batchReviewItems)
        .values({ batchId: input.batchId, cardId: input.cardId, ...decision })
        .onConflictDoUpdate({ target: [batchReviewItems.batchId, batchReviewItems.cardId], set: decision });

      const given = await tx
        .select({ cardId: batchReviewItems.cardId, verdict: batchReviewItems.verdict })
        .from(batchReviewItems)
        .where(and(eq(batchReviewItems.batchId, input.batchId), inArray(batchReviewItems.cardId, sample)));
      const byCard = new Map(given.map((g) => [g.cardId, g.verdict as "good" | "bad"]));
      const progress = reviewProgress(sample.map((id) => byCard.get(id) ?? null));
      if (progress.outcome === "pending") return `Saved. ${progress.summary}.`;

      const reviewed = {
        status: progress.outcome,
        samplePassRate: progress.good / progress.size,
        reviewedBy: viewer.id,
        reviewedAt: new Date().toISOString(),
      };
      await tx.update(cardBatches).set(reviewed).where(eq(cardBatches.id, input.batchId));
      if (progress.outcome === "rejected") return `Batch rejected: ${progress.good} of ${progress.size} good, ${progress.needed} needed.`;

      const live = await tx
        .update(cards)
        .set({ status: "live" })
        .where(and(eq(cards.batchId, input.batchId), eq(cards.status, "draft")))
        .returning({ id: cards.id });
      return `Batch published: ${live.length} cards are live.`;
    });
    refresh(input.batchId);
    return { ok: true, note: outcome };
  } catch (error) {
    if (error instanceof Refused) return { error: error.message };
    logError("recordVerdict failed", error);
    return { error: "Couldn't save that verdict. Try again." };
  }
}

const UndoInput = z.object({ batchId: z.uuid(), cardId: z.uuid() });

export async function undoVerdict(batchId: string, cardId: string): Promise<FormState> {
  const viewer = await adminViewer();
  if (!viewer) return DENIED;
  const parsed = UndoInput.safeParse({ batchId, cardId });
  if (!parsed.success) return { error: "That card isn't valid." };
  const input = parsed.data;

  try {
    await db.transaction(async (tx) => {
      const [batch] = await tx
        .select({ status: cardBatches.status })
        .from(cardBatches)
        .where(eq(cardBatches.id, input.batchId))
        .for("update");
      if (!batch) throw new Refused("That batch no longer exists.");
      if (batch.status !== "draft") throw new Refused("This batch is already decided, so its verdicts are final.");
      await tx.delete(batchReviewItems).where(and(eq(batchReviewItems.batchId, input.batchId), eq(batchReviewItems.cardId, input.cardId)));
    });
    refresh(input.batchId);
    return { ok: true };
  } catch (error) {
    if (error instanceof Refused) return { error: error.message };
    logError("undoVerdict failed", error);
    return { error: "Couldn't undo that. Try again." };
  }
}

const FlagInput = z.object({ cardId: z.uuid(), action: z.enum(["keep", "retire"]) });

export async function resolveFlag(cardId: string, action: "keep" | "retire"): Promise<FormState> {
  const viewer = await adminViewer();
  if (!viewer) return DENIED;
  const parsed = FlagInput.safeParse({ cardId, action });
  if (!parsed.success) return { error: "That choice isn't valid." };
  const input = parsed.data;

  try {
    const found = await db.transaction(async (tx) => {
      if (input.action === "retire") {
        const done = await tx.update(cards).set({ status: "retired" }).where(eq(cards.id, input.cardId)).returning({ id: cards.id });
        return done.length > 0;
      }
      const done = await tx
        .update(cards)
        .set({ hidden: false, flagCount: 0 })
        .where(eq(cards.id, input.cardId))
        .returning({ id: cards.id });
      await tx.delete(cardFlags).where(eq(cardFlags.cardId, input.cardId));
      return done.length > 0;
    });
    if (!found) return { error: "That card no longer exists." };
    revalidatePath("/admin/cards");
    revalidatePath("/admin/cards/flagged");
    return { ok: true, note: input.action === "retire" ? "Card retired." : "Card is back in the feed." };
  } catch (error) {
    logError("resolveFlag failed", error);
    return { error: "Couldn't save that. Try again." };
  }
}
