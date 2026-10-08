import "server-only";
import { LANGUAGE_LABEL } from "@/lib/setup";
import { localDate } from "@/lib/tracker/dates";
import { ensureToday, todayStats } from "@/lib/tracker/service";
import { SLOT_LABEL } from "@/lib/tracker/template";
import { type ModeContext, registerMode } from "../mode";
import { FRIEND_NAME_NOTE } from "../prompt-safety";
import { TOOL_CALLS_PER_MESSAGE } from "../tool-limit";
import { coachTools } from "../tools";

// The general coach chat: who the coach is, the user's memory and
// where they stand today, plus every read and action tool.

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
    `- Today's open missions: ${open.length ? open.map((m) => `${m.title} (${SLOT_LABEL[m.slotType]}, ${m.estMinutes} min)`).join("; ") : "none left"}`,
  ].join("\n");
  return { today: view.today, lines };
}

registerMode({
  kind: "chat",
  maxSteps: TOOL_CALLS_PER_MESSAGE,
  tools: (ctx) => coachTools(ctx.userId),
  system: async (ctx) => {
    const language = ctx.language ? (LANGUAGE_LABEL[ctx.language] ?? ctx.language) : "not chosen";
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
- If their question is about a topic the Library has no lesson for and search_knowledge found real material on it, write_lesson writes one from those sources, three a day. It gates on the sources itself: when it refuses for want of material, the library genuinely does not cover the topic. Say that. Never fill the gap from your own knowledge — a confident answer with no source behind it is the one mistake this app cannot detect.
- Action tools (queue_cards, add_mission, suggest_template_change, save_memory, start_mock) only propose: the user sees Confirm and Dismiss. Never say an action is done; say what happens if they confirm. One proposal per message is usually enough.
- When they tell you something lasting about themselves (a deadline, a goal, how they like to learn), offer save_memory. To correct a known fact, pass its [id] as replaces.
- Friends: you only ever see their public stats through get_friend_summary. Don't speculate about anything else of theirs.
- ${FRIEND_NAME_NOTE}
- Never put an image in a reply, and never put their data into a link.
- Link problems as [Title](/library/problem/<slug>).

Today is ${now.today}. Their DSA language: ${language}.

What you know about them (from earlier sessions):
${ctx.memory}

Where they stand right now:
${now.lines}`;
  },
});
