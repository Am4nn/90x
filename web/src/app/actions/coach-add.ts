"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/components/form";
import { requireViewer } from "@/lib/auth/viewer";
import { type AddMessage, addTurn } from "@/lib/coach/add";
import { logError } from "@/lib/log";

const Text = z.string().trim().min(1).max(500);

export async function addWithCoachAction(text: string): Promise<FormState & { message?: AddMessage }> {
  const viewer = await requireViewer();
  const parsed = Text.safeParse(text);
  if (!parsed.success) return { error: "Tell Coach what to add, in a sentence." };
  try {
    const result = await addTurn(viewer.id, parsed.data);
    if ("error" in result) return { error: result.error };
    revalidatePath("/today");
    return { ok: true, message: result.message };
  } catch (e) {
    logError("add with coach failed", e);
    return { error: "That didn't go through. Try again." };
  }
}
