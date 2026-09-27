"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import type { FormState } from "@/components/form";
import { requireViewer } from "@/lib/auth/viewer";
import { CODE_MAX_CHARS } from "@/lib/coach/review-rules";
import { createSolutionReview } from "@/lib/coach/solution-review";
import { LANGUAGES } from "@/lib/setup";

const ReviewForm = z.object({
  slug: z.string().regex(/^[a-z0-9-]{1,200}$/),
  language: z.enum(LANGUAGES.map((l) => l.value)),
  code: z.string().trim().min(1, "Paste your code first.").max(CODE_MAX_CHARS, "That's over 20,000 characters. Trim it to the solution."),
  checkinId: z
    .string()
    .optional()
    .transform((v) => v || null)
    .pipe(z.uuid().nullable()),
});

/** Review pasted code for the viewer, then open the saved review. */
export async function reviewSolution(_: FormState, form: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  const parsed = ReviewForm.safeParse(Object.fromEntries(form.entries()));
  if (!parsed.success) {
    const issue = parsed.error.issues.find((i) => i.path[0] === "code" || i.path[0] === "language");
    return {
      error:
        issue?.path[0] === "language" ? "Pick a language." : (issue?.message ?? "Something's off with the form. Reload and try again."),
    };
  }
  const { slug, language, code, checkinId } = parsed.data;
  let id: string;
  try {
    const result = await createSolutionReview(viewer.id, { slug, language, code, checkinId, hasPremium: viewer.hasPremium });
    if ("error" in result) return { error: result.error };
    id = result.id;
  } catch (e) {
    console.error("solution review failed", e);
    return { error: "Coach couldn't review this right now. Try again in a minute." };
  }
  redirect(`/library/problem/${slug}/review/${id}`);
}
