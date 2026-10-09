"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import type { FormState } from "@/components/form";
import { requireViewer } from "@/lib/auth/viewer";
import { resolveProposal } from "@/lib/coach/act";
import { addFact, deleteFact, editFact } from "@/lib/coach/memory-edit";
import { MEMORY_KINDS } from "@/lib/coach/memory-rules";
import type { ProposalStatus } from "@/lib/coach/proposals";
import { extractThread, getThread } from "@/lib/coach/threads";
import { logError } from "@/lib/log";

// Coach actions: confirming what the coach proposed, ending a thread, and
// editing what Coach knows. Each is scoped to the signed-in user and returns
// a short error instead of throwing.

export type ProposalState = FormState & { status?: ProposalStatus; href?: string };

const Decision = z.object({
  threadId: z.uuid(),
  toolCallId: z.string().min(1).max(200),
  decision: z.enum(["confirm", "dismiss"]),
  refs: z.array(z.string().min(1).max(200)).min(1).max(3).optional(),
});

export async function decideProposal(input: {
  threadId: string;
  toolCallId: string;
  decision: "confirm" | "dismiss";
  refs?: string[];
}): Promise<ProposalState> {
  const viewer = await requireViewer();
  const parsed = Decision.safeParse(input);
  if (!parsed.success) return { error: "That suggestion can't be used." };
  try {
    const result = await resolveProposal(viewer.id, parsed.data.threadId, parsed.data.toolCallId, parsed.data.decision, parsed.data.refs);
    if ("error" in result) return { error: result.error };
    if (result.status === "confirmed") {
      revalidatePath("/today");
      revalidatePath("/me/plan");
      revalidatePath("/me/coach");
      revalidatePath("/coach/mocks");
      revalidatePath("/me");
    }
    return { ok: true, status: result.status, note: result.note, href: result.href };
  } catch (e) {
    logError("coach proposal failed", e);
    return { error: "That didn't go through. Try again." };
  }
}

/** "End" on a thread: extract what Coach should remember now instead of waiting for it to go quiet. */
export async function endThread(threadId: string): Promise<FormState> {
  const viewer = await requireViewer();
  if (!z.uuid().safeParse(threadId).success) return { error: "That conversation isn't there." };
  try {
    const thread = await getThread(viewer.id, threadId);
    if (!thread) return { error: "That conversation isn't there." };
    if (!thread.memoryExtractedAt) after(() => extractThread(viewer.id, threadId));
    return { ok: true, note: "Wrapped up. Coach keeps what matters from this chat." };
  } catch (e) {
    logError("end thread failed", e);
    return { error: "That didn't go through. Try again." };
  }
}

const factText = z.string().trim().min(3, "Write at least a few words.").max(300, "Keep it under 300 characters.");

async function memoryChange(fn: () => Promise<boolean | void>, note: string): Promise<FormState> {
  try {
    if ((await fn()) === false) return { error: "That note is gone. Reload the page." };
    revalidatePath("/me/coach");
    return { ok: true, note };
  } catch (e) {
    logError("memory change failed", e);
    return { error: "That didn't save. Try again." };
  }
}

export async function addMemoryNote(_: FormState, form: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  const parsed = z.object({ kind: z.enum(MEMORY_KINDS), text: factText }).safeParse({ kind: form.get("kind"), text: form.get("text") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Pick a kind and write the note." };
  return memoryChange(() => addFact(viewer.id, parsed.data.kind, parsed.data.text), "Added. Coach will use it from the next message.");
}

export async function editMemoryNote(_: FormState, form: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  const parsed = z.object({ id: z.uuid(), text: factText }).safeParse({ id: form.get("id"), text: form.get("text") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "That note can't be saved." };
  return memoryChange(() => editFact(viewer.id, parsed.data.id, { text: parsed.data.text }), "Saved.");
}

export async function deleteMemoryNote(id: string): Promise<FormState> {
  const viewer = await requireViewer();
  if (!z.uuid().safeParse(id).success) return { error: "That note is gone. Reload the page." };
  return memoryChange(() => deleteFact(viewer.id, id), "Deleted. Coach won't learn it again.");
}
