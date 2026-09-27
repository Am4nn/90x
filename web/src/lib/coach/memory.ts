import "server-only";
import { generateText, Output } from "ai";
import { and, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { coachMemory } from "@/db/schema";
import { fastModel, NO_THINKING } from "@/lib/ai";
import { recordUsage } from "@/lib/ai/usage";
import {
  ageFacts,
  type Evidence,
  type Fact,
  MEMORY_KINDS,
  type MemoryKind,
  type MemoryStatus,
  memoryBlock,
  planMerge,
} from "./memory-rules";
import { modelName } from "./model";

// Per-user coach memory. Every query is scoped to one user id;
// no function here reads or writes another user's memory.

export type { Evidence, Fact };

export async function listMemory(userId: string, opts: { includeResolved?: boolean } = {}): Promise<Fact[]> {
  const rows = await db
    .select()
    .from(coachMemory)
    .where(and(eq(coachMemory.userId, userId), opts.includeResolved ? undefined : ne(coachMemory.status, "resolved")))
    .orderBy(coachMemory.kind, coachMemory.createdAt);
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind as MemoryKind,
    text: r.text,
    status: r.status as MemoryStatus,
    evidence: (r.evidence ?? []) as Evidence[],
    updatedAt: r.updatedAt,
  }));
}

/** The memory section for a coach prompt (active + improving facts, with ids). */
export async function memoryForPrompt(userId: string): Promise<string> {
  return memoryBlock(await listMemory(userId));
}

const EXTRACT_SYSTEM = `You maintain a coach's long-term notes about one person preparing for software-engineering interviews.
From the new material, extract only LASTING facts worth remembering across sessions:
- habit: a recurring behaviour in how they solve or explain (e.g. "forgets empty-input edge cases")
- strength: something they reliably do well
- goal: a concrete target or deadline ("Amazon interview Nov 20")
- preference: how they like to learn or be coached
- context: stable background (role, language, schedule constraints)
Don't record one-off events, scores, or anything about other people. Write each fact in one short sentence.
Also list the ids of already-known facts (shown with [id]) that the new material shows again.
If nothing lasting was learned, return empty lists.`;

const ExtractSchema = z.object({
  facts: z.array(z.object({ kind: z.enum(MEMORY_KINDS), text: z.string().min(3).max(300) })).max(8),
  seen: z.array(z.string()).max(20),
});

/**
 * Extract lasting facts from a finished thread, solution review or mock and
 * merge them into the user's memory. Failures are logged, never thrown: memory
 * is a bonus, not part of the user's action.
 */
export async function extractMemory(userId: string, source: Evidence, material: string): Promise<{ added: number; updated: number }> {
  try {
    const existing = await listMemory(userId);
    const model = fastModel();
    const result = await generateText({
      model,
      system: EXTRACT_SYSTEM,
      prompt: `Known facts:\n${memoryBlock(existing)}\n\nNew material (${source.kind}):\n${material.slice(0, 12000)}`,
      output: Output.object({ schema: ExtractSchema }),
      temperature: 0,
      providerOptions: NO_THINKING,
    });
    await recordUsage({
      userId,
      route: "coach.memory",
      model: modelName(model),
      tokensIn: result.usage.inputTokens ?? 0,
      tokensOut: result.usage.outputTokens ?? 0,
    });
    const plan = planMerge(existing, result.output, source);
    if (plan.insert.length) {
      await db
        .insert(coachMemory)
        .values(plan.insert.map((f) => ({ userId, kind: f.kind, text: f.text, evidence: f.evidence, source: "coach" })));
    }
    for (const u of plan.update) {
      await db
        .update(coachMemory)
        .set({ status: u.status, evidence: u.evidence })
        .where(and(eq(coachMemory.id, u.id), eq(coachMemory.userId, userId)));
    }
    return { added: plan.insert.length, updated: plan.update.length };
  } catch (e) {
    console.error("memory extraction failed", e);
    return { added: 0, updated: 0 };
  }
}

/** Weekly: habits that stopped showing up move to improving, then resolved. */
export async function ageMemory(userId: string, now = new Date()) {
  const changes = ageFacts(await listMemory(userId), now);
  for (const status of ["improving", "resolved"] as const) {
    const ids = changes.filter((c) => c.status === status).map((c) => c.id);
    if (ids.length) {
      await db
        .update(coachMemory)
        .set({ status })
        .where(and(eq(coachMemory.userId, userId), inArray(coachMemory.id, ids)));
    }
  }
  return changes.length;
}
