"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/components/form";
import { requireViewer } from "@/lib/auth/viewer";
import { queueProblems } from "@/lib/coach/missions";

const Slugs = z
  .array(z.string().regex(/^[a-z0-9-]{1,200}$/))
  .min(1)
  .max(3);

/**
 * Coach's "put these on my plan": the review's Queue next problem and the
 * lesson's queue_ladder confirm. First problem today, the rest tomorrow.
 */
export async function queueProblemsAction(slugs: string[], from: "review" | "lesson"): Promise<FormState> {
  const viewer = await requireViewer();
  const parsed = Slugs.safeParse(slugs);
  if (!parsed.success) return { error: "Unknown problem." };
  try {
    const result = await queueProblems(
      viewer.id,
      parsed.data,
      from === "review" ? "Queued from your solution review" : "Queued from your pattern lesson",
    );
    if ("error" in result) return { error: result.error };
    revalidatePath("/today");
    if (!result.added) return { ok: true, note: "Already on your plan." };
    return {
      ok: true,
      note: result.today === result.added ? "Added to today." : "Added to your plan: the first today, the rest tomorrow.",
    };
  } catch (e) {
    console.error("queue problems failed", e);
    return { error: "That didn't save. Try again." };
  }
}
