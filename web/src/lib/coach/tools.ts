import "server-only";
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { SLOT_MINUTES, SLOT_TYPES } from "@/lib/tracker/template";
import { listMemory } from "./memory";
import { MEMORY_KINDS } from "./memory-rules";
import { BEHAVIORAL_QUESTIONS } from "./mock-rules";
import { designTopics } from "./mocks";
import { applyTemplateChanges, type Proposal, templateDiff } from "./proposals";
import {
  summarizeActivity,
  summarizeCards,
  summarizeFriends,
  summarizePlan,
  summarizeProblems,
  summarizeProgress,
  summarizeSearch,
  summarizeWeakSpots,
} from "./tool-summaries";
import {
  activeTemplates,
  findCardsData,
  findProblemsData,
  friendSummaryData,
  liveCards,
  planData,
  problemBySlug,
  progressData,
  recentActivityData,
  searchKnowledge,
  topicBySlugOrName,
  weakSpotsData,
} from "./tools-data";

// The coach's tools, bound to one user. Read tools run freely and
// return summaries; action tools only return a proposal the user confirms in
// the chat (app/actions/coach.ts performs it).

/** A failed lookup becomes a short error the model can answer around, not a broken stream. */
function safely<I, O>(name: string, run: (input: I) => Promise<O>) {
  return async (input: I): Promise<O | { error: string }> => {
    try {
      return await run(input);
    } catch (e) {
      console.error(`coach tool ${name} failed`, e);
      return { error: "That lookup failed. Say you couldn't check, don't guess." };
    }
  };
}

const PROPOSED = "Shown to the user with Confirm and Dismiss buttons. Nothing has changed yet; don't say it's done.";
const propose = (proposal: Proposal) => ({ proposal, note: PROPOSED });

const reason = z.string().max(200).describe("One short line on why, shown above the changes.");

export function coachTools(userId: string): ToolSet {
  return {
    get_progress: tool({
      description: "The user's readiness score per area (0-100), 14-day trend, streak and campaign day.",
      inputSchema: z.object({}),
      execute: safely("get_progress", async () => summarizeProgress(await progressData(userId))),
    }),
    get_weak_spots: tool({
      description:
        "The user's weakest DSA patterns and topics with evidence: recent failed problems, missed cards, low mock scores, plus topics they marked as new to them, which is a gap they declared rather than one we inferred.",
      inputSchema: z.object({}),
      execute: safely("get_weak_spots", async () => summarizeWeakSpots(await weakSpotsData(userId))),
    }),
    get_recent_activity: tool({
      description: "The user's check-ins, card results and mocks from the last 14 days.",
      inputSchema: z.object({}),
      execute: safely("get_recent_activity", async () => summarizeActivity(await recentActivityData(userId))),
    }),
    get_plan: tool({
      description: "Today's missions, the daily template per weekday (slot counts) and company focus.",
      inputSchema: z.object({}),
      execute: safely("get_plan", async () => summarizePlan(await planData(userId))),
    }),
    search_knowledge: tool({
      description:
        "Search the study library (docs and problem statements) for passages on a concept. Returns title, url and snippet; cite what you use.",
      inputSchema: z.object({ query: z.string().min(2).max(200).describe("What to look up, in plain words.") }),
      execute: safely("search_knowledge", async ({ query }) => summarizeSearch(await searchKnowledge(query))),
    }),
    find_problems: tool({
      description:
        "Find LeetCode problems in the bank by pattern (name or slug), difficulty, company, and whether the user solved them. Returns up to 10, most important first.",
      inputSchema: z.object({
        pattern: z.string().max(60).optional(),
        difficulty: z.enum(["Easy", "Medium", "Hard"]).optional(),
        company: z.string().max(60).optional(),
        status: z.enum(["solved", "unsolved", "any"]).optional(),
        limit: z.int().min(1).max(10).optional(),
      }),
      execute: safely("find_problems", async (filters) => {
        const found = await findProblemsData(userId, filters);
        if ("unknownPattern" in found)
          return { problems: [], note: `No pattern called "${found.unknownPattern}".`, patterns: found.patterns };
        return { problems: summarizeProblems(found.problems) };
      }),
    }),
    find_cards: tool({
      description:
        "Find live study cards by topic and format, or the user's missed cards (last answer wrong or skipped). Returns ids for queue_cards.",
      inputSchema: z.object({
        topic: z.string().max(60).optional(),
        format: z.enum(["typed", "flash", "mcq", "output", "bug"]).optional(),
        missed: z.boolean().optional().describe("Only cards the user got wrong or skipped last time."),
        limit: z.int().min(1).max(10).optional(),
      }),
      execute: safely("find_cards", async (filters) => ({ cards: summarizeCards(await findCardsData(userId, filters)) })),
    }),
    get_friend_summary: tool({
      description:
        "Friends' public stats only: readiness, streak, problems solved this week, mock scores. Optionally one friend by first name.",
      inputSchema: z.object({ name: z.string().max(40).optional() }),
      execute: safely("get_friend_summary", async ({ name }) => ({ friends: summarizeFriends(await friendSummaryData(userId, name)) })),
    }),

    queue_cards: tool({
      description: "Propose putting up to 10 cards (ids from find_cards) at the front of the user's feed.",
      inputSchema: z.object({ cardIds: z.array(z.uuid()).min(1).max(10) }),
      execute: safely("queue_cards", async ({ cardIds }) => {
        const found = await liveCards([...new Set(cardIds)]);
        if (!found.length) return { error: "None of those cards are live. Use find_cards for ids." };
        const topicsList = [...new Set(found.map((c) => c.topic))].slice(0, 3).join(", ");
        return propose({
          type: "queue_cards",
          summary: `Add ${found.length} card${found.length === 1 ? "" : "s"} on ${topicsList} to the front of your feed`,
          payload: { cardIds: found.map((c) => c.id) },
        });
      }),
    }),
    add_mission: tool({
      description: "Propose adding one extra item to today's missions: a new problem, a problem review, or a topic to study.",
      inputSchema: z.object({
        kind: z.enum(["problem", "review", "topic"]),
        ref: z.string().min(1).max(200).describe("Problem slug for problem/review, topic slug or name for topic."),
      }),
      execute: safely("add_mission", async ({ kind, ref }) => {
        const slotType = kind === "problem" ? "new_problem" : kind;
        const target =
          kind === "topic"
            ? await topicBySlugOrName(ref).then((t) => t && { ref: t.slug, title: t.name })
            : await problemBySlug(ref).then((p) => p && { ref: p.slug, title: p.title });
        if (!target) return { error: `No ${kind === "topic" ? "topic" : "problem"} "${ref}". Look it up first.` };
        const estMinutes = SLOT_MINUTES[slotType];
        return propose({
          type: "add_mission",
          summary: `Add ${target.title} to today (${estMinutes} min)`,
          payload: { slotType, ref: target.ref, title: target.title, estMinutes },
        });
      }),
    }),
    suggest_template_change: tool({
      description:
        "Propose changing slot counts in the user's daily template (weekday 0 = Sunday … 6 = Saturday). Call get_plan first to see the current counts.",
      inputSchema: z.object({
        changes: z
          .array(z.object({ weekday: z.int().min(0).max(6), slot: z.enum(SLOT_TYPES), to: z.int().min(0).max(6) }))
          .min(1)
          .max(14),
        reason,
      }),
      execute: safely("suggest_template_change", async ({ changes, reason: why }) => {
        const current = await activeTemplates(userId);
        if (!current) return { error: "The user has no active campaign." };
        const diff = templateDiff(current, changes);
        if (!diff.length) return { error: "Those counts are already the plan." };
        const applied = applyTemplateChanges(current, diff);
        if ("error" in applied) return { error: applied.error };
        return propose({ type: "suggest_template_change", summary: why || "Change your daily plan", payload: { changes: diff } });
      }),
    }),
    save_memory: tool({
      description:
        "Propose remembering a lasting fact about the user (habit, strength, goal, preference, context), or correcting a known one by its [id].",
      inputSchema: z.object({
        kind: z.enum(MEMORY_KINDS),
        text: z.string().min(3).max(300).describe("One short sentence."),
        replaces: z.uuid().optional().describe("Id of the known fact this corrects."),
      }),
      execute: safely("save_memory", async ({ kind, text, replaces }) => {
        const old = replaces ? (await listMemory(userId, { includeResolved: true })).find((f) => f.id === replaces) : undefined;
        if (replaces && !old) return { error: "No known fact with that id." };
        return propose({
          type: "save_memory",
          summary: old ? `Change "${old.text}" to "${text.trim()}"` : `Remember: ${text.trim()}`,
          payload: { id: old?.id ?? null, kind, text: text.trim() },
        });
      }),
    }),
    start_mock: tool({
      description:
        "Propose starting a text mock interview: system design on a topic from the mock list, or a behavioral question from the list. A wrong topic returns the list.",
      inputSchema: z.object({ type: z.enum(["design", "behavioral"]), topic: z.string().min(1).max(200) }),
      execute: safely("start_mock", async ({ type, topic }) => {
        // Only topics startMock accepts, so a confirmed proposal always starts.
        const allowed: string[] = type === "design" ? await designTopics() : [...BEHAVIORAL_QUESTIONS];
        const match = allowed.find((t) => t.toLowerCase() === topic.trim().toLowerCase());
        if (!match) return { error: `"${topic}" isn't on the ${type} mock list.`, topics: allowed };
        return propose({
          type: "start_mock",
          summary: `Start a ${type} mock: ${match}. Any mock still running ends.`,
          payload: { type, topic: match },
        });
      }),
    }),
  };
}
