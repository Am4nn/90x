import "server-only";
import { generateText, Output } from "ai";
import { and, eq, inArray, notInArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { coachMemory } from "@/db/schema";
import { fastModel, NO_THINKING } from "@/lib/ai";
import { billedTokens } from "@/lib/ai/cost";
import { aiGate } from "@/lib/ai/guard";
import { OUTPUT_TOKENS } from "@/lib/ai/limits";
import { recordUsage } from "@/lib/ai/usage";
import {
  ageFacts,
  DISMISSED,
  type Evidence,
  type Fact,
  MEMORY_KINDS,
  type MemoryKind,
  type MemoryStatus,
  memoryBlock,
  planMerge,
} from "./memory-rules";
import { modelName } from "./model";
import { fence, untrustedNote } from "./prompt-safety";

// Per-user coach memory. Every query is scoped to one user id;
// no function here reads or writes another user's memory.

export type { Evidence, Fact };

export async function listMemory(userId: string, opts: { includeResolved?: boolean } = {}): Promise<Fact[]> {
  const rows = await db
    .select()
    .from(coachMemory)
    .where(
      and(eq(coachMemory.userId, userId), notInArray(coachMemory.status, opts.includeResolved ? [DISMISSED] : [DISMISSED, "resolved"])),
    )
    .orderBy(coachMemory.kind, coachMemory.createdAt);
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind as MemoryKind,
    text: r.text,
    status: r.status as MemoryStatus,
    evidence: (r.evidence ?? []) as Evidence[],
    lastSeenAt: r.lastSeenAt,
    expiresOn: r.expiresOn,
  }));
}

/** Texts of facts the user deleted, so extraction never learns them again. */
async function dismissedTexts(userId: string): Promise<string[]> {
  const rows = await db
    .select({ text: coachMemory.text })
    .from(coachMemory)
    .where(and(eq(coachMemory.userId, userId), eq(coachMemory.status, DISMISSED)));
  return rows.map((r) => r.text);
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
If a new fact corrects or updates a known fact (a moved date, a changed goal), set "replaces" to that fact's [id].
Whenever a goal or context has a date (an interview, a deadline, "until December"), set "expires" to that date as YYYY-MM-DD, using the next such date after today.
In "seen", list the ids of known facts that the new material shows again.
In "retired", list the ids of known facts the new material shows are no longer true (a goal met or dropped, a habit they say they've fixed).
Never record anything under "Removed by the user", or anything that means the same.
If nothing lasting was learned, return empty lists.`;
const EXTRACT_FENCED = `${EXTRACT_SYSTEM}\n\n${untrustedNote("material")}`;

const ExtractSchema = z.object({
  facts: z
    .array(
      z.object({
        kind: z.enum(MEMORY_KINDS),
        text: z.string().min(3).max(300),
        replaces: z.string().nullish(),
        expires: z.string().nullish(),
      }),
    )
    .max(8),
  seen: z.array(z.string()).max(20),
  retired: z.array(z.string()).max(20).nullish(),
});

/**
 * Extract lasting facts from a finished thread, solution review or mock and
 * merge them into the user's memory. Failures are logged, never thrown: memory
 * is a bonus, not part of the user's action.
 */
export async function extractMemory(userId: string, source: Evidence, material: string): Promise<{ added: number; updated: number }> {
  try {
    // Memory is a bonus: when AI is stopped it simply does not update.
    if (!(await aiGate(userId)).allowed) return { added: 0, updated: 0 };
    const [existing, dismissed] = await Promise.all([listMemory(userId), dismissedTexts(userId)]);
    const now = new Date();
    const removed = dismissed.length ? `\n\nRemoved by the user:\n${dismissed.map((t) => `- ${t}`).join("\n")}` : "";
    const model = fastModel();
    const result = await generateText({
      model,
      maxOutputTokens: OUTPUT_TOKENS.memory,
      system: EXTRACT_FENCED,
      prompt: `Today is ${now.toISOString().slice(0, 10)}.\n\nKnown facts:\n${memoryBlock(existing)}${removed}\n\nNew material (${source.kind}):\n${fence("material", material.slice(0, 12000))}`,
      output: Output.object({ schema: ExtractSchema }),
      temperature: 0,
      providerOptions: NO_THINKING,
    });
    await recordUsage({
      userId,
      route: "coach.memory",
      model: modelName(model),
      ...billedTokens(result.steps),
    });
    const plan = planMerge(existing, result.output, source, now, dismissed);
    if (plan.insert.length) {
      await db
        .insert(coachMemory)
        .values(
          plan.insert.map((f) => ({ userId, kind: f.kind, text: f.text, evidence: f.evidence, expiresOn: f.expiresOn, source: "coach" })),
        );
    }
    for (const u of plan.update) {
      await db
        .update(coachMemory)
        .set({ status: u.status, evidence: u.evidence, ...(u.lastSeenAt ? { lastSeenAt: u.lastSeenAt } : {}) })
        .where(and(eq(coachMemory.id, u.id), eq(coachMemory.userId, userId)));
    }
    return { added: plan.insert.length, updated: plan.update.length };
  } catch (e) {
    console.error("memory extraction failed", e);
    return { added: 0, updated: 0 };
  }
}

/** Weekly: habits that stopped showing up move to improving, then resolved; facts past their date resolve. */
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
