import "server-only";
import { tool } from "ai";
import { z } from "zod";
import { mockMinutes, STAGES, stageAt } from "../mock-rules";
import { mockView } from "../mocks";
import { registerMode } from "../mode";
import { listStories } from "../stories";
import { storiesBlock } from "../story-rules";

// Mock interview mode: the coach plays the interviewer for the
// thread's mock (ctx.ref = mock id), following the stage plan by the clock.

const PERSONA = `You are the interviewer in a text mock interview for a software engineer. Stay in role.
- Ask one question at a time and keep your turns short (1-4 sentences).
- Never give the answer, a model design or a model story during the mock. If they ask, turn it back into a question.
- React like a real interviewer: note what's missing, ask for specifics, numbers and trade-offs.
- Follow the stage plan below by the clock; move on when a stage's time is up even if they haven't finished.
- When the time is up or the plan is done, call end_mock to offer ending. Don't score or give feedback yourself; ending does that.`;

const minutes = (ms: number) => Math.max(0, Math.ceil(ms / 60_000));

registerMode({
  kind: "mock",
  maxSteps: 2,
  async system(ctx) {
    const id = z.uuid().safeParse(ctx.ref);
    const mock = id.success ? await mockView(ctx.userId, id.data) : null;
    if (!mock) {
      return "There is no mock interview for this thread. Tell the user to start one from Coach > Mocks (/coach/mocks) and answer nothing else.";
    }
    if (mock.status !== "running") {
      return `${PERSONA}\n\nThis mock (${mock.type}: ${mock.topic}) has ended${mock.score != null ? ` with a score of ${mock.score}` : ""}. Step out of role: answer questions about how it went, briefly, and point them to /coach/mocks/${mock.id} for the full feedback.\n\nWhat you know about them:\n${ctx.memory}`;
    }
    const now = stageAt(mock.type, mock.startedAt, ctx.now);
    const plan = STAGES[mock.type]
      .map((s, i) => `${i + 1}. ${s.label} (${s.minutes} min): ${s.prompt}${i === now.index ? "  <- now" : ""}`)
      .join("\n");
    const parts = [
      PERSONA,
      `Mock: ${mock.type}, ${mockMinutes(mock.type)} minutes. ${mock.type === "design" ? "Problem" : "Question"}: ${mock.topic}`,
      `Stage plan:\n${plan}`,
      now.over
        ? "Time is up. Close the interview in one line and call end_mock."
        : `Now: ${now.stage.label}, about ${minutes(now.stageLeftMs)} min left in this stage and ${minutes(now.leftMs)} min overall.`,
    ];
    if (mock.type === "behavioral") {
      const stories = await listStories(ctx.userId);
      parts.push(
        `Their STAR stories (use them to probe: if their answer skips a detail their story has, ask for it; if they pick a weak story, ask about a stronger one):\n${storiesBlock(stories)}`,
      );
    }
    parts.push(`What you know about them (don't mention it unless relevant):\n${ctx.memory}`);
    return parts.join("\n\n");
  },
  tools(ctx) {
    return {
      end_mock: tool({
        description: "Offer to end the mock interview and score it. Only proposes; the user confirms with a tap.",
        inputSchema: z.object({ reason: z.string().max(200).describe("One short line: why now (time is up, plan done, they asked).") }),
        execute: async ({ reason }) => ({
          proposal: { type: "end_mock", summary: `End the mock and get your score. ${reason}`.trim(), payload: { mockId: ctx.ref } },
        }),
      }),
    };
  },
});
