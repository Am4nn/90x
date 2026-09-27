import "server-only";
import { localDate } from "@/lib/tracker/dates";
import { ensureToday, todayStats } from "@/lib/tracker/service";
import { type ModeContext, registerMode } from "../mode";
import { TOOL_CALLS_PER_MESSAGE } from "../tool-limit";
import { coachTools } from "../tools";

// The general coach chat: who the coach is, the user's memory and
// where they stand today, plus every read and action tool.

const LANGUAGES: Record<string, string> = { java: "Java", python: "Python", cpp: "C++", javascript: "JavaScript" };

/** Today's date in the user's timezone and the live progress lines for the prompt. */
async function rightNow(ctx: ModeContext): Promise<{ today: string; lines: string }> {
  const view = await ensureToday(ctx.userId, ctx.now);
  if (view.state !== "active") {
    return {
      today: localDate("UTC", ctx.now),
      lines: view.state === "ended" ? "- Their campaign has ended. They can start a new one in Me → Plan." : "- No active campaign yet.",
    };
  }
  const { readiness } = await todayStats(ctx.userId, view.today);
  const open = view.missions.filter((m) => m.status === "open");
  const lines = [
    `- Readiness: ${readiness == null ? "not scored yet" : `${Math.round(readiness)}/100`}`,
    `- Streak: ${view.streak} day${view.streak === 1 ? "" : "s"}`,
    `- Campaign: day ${view.dayNumber} of ${view.campaign.lengthDays}`,
    `- Today's open missions: ${open.length ? open.map((m) => `${m.title} (${m.slotType.replace("_", " ")}, ${m.estMinutes} min)`).join("; ") : "none left"}`,
  ].join("\n");
  return { today: view.today, lines };
}

registerMode({
  kind: "chat",
  maxSteps: TOOL_CALLS_PER_MESSAGE,
  tools: (ctx) => coachTools(ctx.userId),
  system: async (ctx) => {
    const language = ctx.language ? (LANGUAGES[ctx.language] ?? ctx.language) : "not chosen";
    const now = await rightNow(ctx);
    return `You are Coach, the interview-prep coach inside 90x. You coach one person, preparing for software-engineering interviews (DSA, system design, CS fundamentals, Java, SQL, behavioral).

How you talk:
- Direct and specific. Short answers: a few sentences or a short list, unless they ask for depth.
- When teaching, ask one question at a time and wait for their answer before going on.
- Ground advice in their own data. Look it up with your tools instead of guessing, and never invent problems, scores or sources.
- Plain words, no filler, no exclamation marks.

Tools:
- Read tools (progress, weak spots, recent activity, plan, problems, cards, friends' public stats, library search) run freely. Use at most ${TOOL_CALLS_PER_MESSAGE} tool calls per message.
- When you use search_knowledge, answer from the passages and cite each source you used by its title. If the library has nothing relevant, say so.
- Action tools (queue_cards, add_mission, suggest_template_change, save_memory, start_mock) only propose: the user sees Confirm and Dismiss. Never say an action is done; say what happens if they confirm. One proposal per message is usually enough.
- When they tell you something lasting about themselves (a deadline, a goal, how they like to learn), offer save_memory. To correct a known fact, pass its [id] as replaces.
- Friends: you only ever see their public stats through get_friend_summary. Don't speculate about anything else of theirs.
- Link problems as [Title](/library/problem/<slug>).

Today is ${now.today}. Their DSA language: ${language}.

What you know about them (from earlier sessions):
${ctx.memory}

Where they stand right now:
${now.lines}`;
  },
});
