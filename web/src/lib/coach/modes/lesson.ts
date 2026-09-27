import "server-only";
import { tool } from "ai";
import { z } from "zod";
import { lessonLadder, lessonMaterial, patternCardIds } from "../lesson";
import { lessonPrompt } from "../lesson-rules";
import { type ModeContext, registerMode } from "../mode";

// Pattern lesson: ctx.ref is the pattern slug. The prompt holds
// only our own material; the two tools only propose or record, nothing
// changes until the user confirms (the proposal cards).

const NO_PATTERN = `You are Coach. The person opened a pattern lesson, but the pattern wasn't found.
Ask which pattern they want to learn and tell them they can start one from a node on the Pattern Map in the Library. Don't teach from memory.`;

function tools(ctx: ModeContext) {
  const pattern = ctx.ref;
  return {
    queue_ladder: tool({
      description:
        "Propose adding up to 3 problems from this lesson's ladder to their plan (the first today, the rest tomorrow). Only proposes; they confirm.",
      inputSchema: z.object({ slugs: z.array(z.string().max(200)).min(1).max(3).describe("Slugs from the ladder, in ladder order") }),
      execute: async ({ slugs }) => {
        if (!pattern) return { error: "No pattern in this lesson." };
        const { rungs } = await lessonLadder(ctx.userId, pattern);
        const picked = rungs.filter((r) => slugs.includes(r.slug));
        if (!picked.length) return { error: "Those problems aren't on this lesson's ladder." };
        const [first, ...rest] = picked;
        return {
          proposal: {
            type: "queue_ladder",
            summary: `Add ${first?.title} to today${rest.length ? `, then ${rest.map((r) => r.title).join(" and ")} tomorrow` : ""}`,
            payload: { slugs: picked.map((r) => r.slug) },
          },
        };
      },
    }),
    finish_lesson: tool({
      description: "Call once when the lesson ends: records what they learned and what was weak, and suggests the pattern's review cards.",
      inputSchema: z.object({
        summary: z.string().max(600).describe("Two or three sentences: what they got, what was weak, what to practise next."),
      }),
      execute: async ({ summary }) => {
        if (!pattern) return { recorded: true, summary };
        const cardIds = await patternCardIds(pattern);
        // queue_cards is the confirm action; this only proposes it.
        return cardIds.length
          ? {
              recorded: true,
              summary,
              proposal: {
                type: "queue_cards",
                summary: `Put ${cardIds.length} cards on this pattern at the front of your feed`,
                payload: { cardIds },
              },
            }
          : { recorded: true, summary };
      },
    }),
  };
}

registerMode({
  kind: "lesson",
  system: async (ctx) => {
    if (!ctx.ref) return NO_PATTERN;
    const material = await lessonMaterial(ctx.userId, ctx.ref, ctx.language, ctx.memory, ctx.now);
    return material ? lessonPrompt(material) : NO_PATTERN;
  },
  tools,
});
