import "server-only";
import { z } from "zod";
import { registerMode } from "../mode";
import { followUpPrompt } from "../review-rules";
import { getSolutionReview } from "../solution-review";

// Follow-ups on a saved solution review: ctx.ref is the review id. The review,
// code and problem ride in the system prompt; no tools.

const NOT_FOUND = `You are Coach. The person wanted to discuss a solution review, but it wasn't found.
Tell them to open the review from its problem page and tap Discuss with Coach again, or paste the code here.`;

registerMode({
  kind: "review",
  system: async (ctx) => {
    if (!ctx.ref || !z.uuid().safeParse(ctx.ref).success) return NOT_FOUND;
    const saved = await getSolutionReview(ctx.userId, ctx.ref);
    if (!saved) return NOT_FOUND;
    return followUpPrompt({
      problem: { ...saved.problem, patternName: saved.pattern?.name ?? null },
      language: saved.language,
      code: saved.code,
      review: saved.review,
      memory: ctx.memory,
    });
  },
});
