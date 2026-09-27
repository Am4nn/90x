"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/components/form";
import { requireViewer } from "@/lib/auth/viewer";
import { decideWeekly } from "@/lib/coach/weekly";

/** Accept applies the review's template changes via setTemplates; Decline only records it. */
export async function decideWeeklyAction(reviewId: string, accept: boolean): Promise<FormState> {
  const viewer = await requireViewer();
  const id = z.uuid().safeParse(reviewId);
  if (!id.success || typeof accept !== "boolean") return { error: "That review doesn't exist." };
  try {
    const error = await decideWeekly(viewer.id, id.data, accept);
    if (error) return { error };
    revalidatePath(`/me/weekly/${id.data}`);
    revalidatePath("/me/plan");
    revalidatePath("/today");
    return { ok: true, note: accept ? "Applied from tomorrow." : "Kept your plan as it is." };
  } catch (e) {
    console.error("decideWeeklyAction failed", e);
    return { error: "Couldn't save that. Try again." };
  }
}
