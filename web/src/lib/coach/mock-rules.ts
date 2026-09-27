import { z } from "zod";

// Mock interviews: text chat with a timer and stage
// prompts, scored on a fixed rubric. Pure rules shared by the mode, the
// scoring call and the header timer.

export const MOCK_TYPES = ["design", "behavioral"] as const;
export type MockType = (typeof MOCK_TYPES)[number];

export type Stage = { key: string; label: string; minutes: number; prompt: string };

export const STAGES: Record<MockType, Stage[]> = {
  design: [
    {
      key: "requirements",
      label: "Requirements",
      minutes: 5,
      prompt: "Let them pin down functional and non-functional requirements and rough scale. Answer clarifying questions briefly.",
    },
    {
      key: "high_level",
      label: "High-level design",
      minutes: 10,
      prompt: "Ask for the main components, APIs and data model. Let them draw the boxes in words before going deeper.",
    },
    {
      key: "deep_dive",
      label: "Deep dive",
      minutes: 15,
      prompt: "Pick the riskiest part of their design and push on it: scaling, failure, consistency, hot keys, numbers.",
    },
    {
      key: "wrap_up",
      label: "Wrap-up",
      minutes: 5,
      prompt: "Ask what they would change with more time and which trade-offs they made. Then suggest ending the mock.",
    },
  ],
  behavioral: [
    {
      key: "question",
      label: "Question",
      minutes: 5,
      prompt: "Ask the question and let them tell the story. Don't interrupt unless they stall.",
    },
    {
      key: "follow_ups",
      label: "Follow-ups",
      minutes: 10,
      prompt: "Probe one thing at a time: what exactly they did (not the team), numbers behind the result, what went wrong.",
    },
    {
      key: "reflection",
      label: "Reflection",
      minutes: 5,
      prompt: "Ask what they learned and what they'd do differently. Then suggest ending the mock.",
    },
  ],
};

export function mockMinutes(type: MockType): number {
  return STAGES[type].reduce((sum, s) => sum + s.minutes, 0);
}

const MINUTE = 60_000;

/** Where a mock is at `now`: the current stage, and time left in it and overall. */
export function stageAt(type: MockType, startedAt: Date | string, now: Date) {
  const stages = STAGES[type];
  const start = typeof startedAt === "string" ? new Date(startedAt) : startedAt;
  const total = mockMinutes(type) * MINUTE;
  // A client clock a little behind the server would make elapsed negative.
  const elapsed = Math.min(Math.max(0, now.getTime() - start.getTime()), total);
  let end = 0;
  for (const [index, stage] of stages.entries()) {
    end += stage.minutes * MINUTE;
    if (elapsed < end || index === stages.length - 1) {
      return { stage, index, leftMs: total - elapsed, stageLeftMs: end - elapsed, over: elapsed >= total };
    }
  }
  throw new Error("mock type without stages");
}

export const RUBRIC: Record<MockType, { key: string; label: string }[]> = {
  design: [
    { key: "requirements", label: "Requirements" },
    { key: "high_level", label: "High-level design" },
    { key: "deep_dive", label: "Deep dive" },
    { key: "trade_offs", label: "Trade-offs" },
    { key: "communication", label: "Communication" },
  ],
  behavioral: [
    { key: "situation", label: "Situation clarity" },
    { key: "ownership", label: "Ownership" },
    { key: "action", label: "Action detail" },
    { key: "result", label: "Result and impact" },
    { key: "reflection", label: "Reflection" },
  ],
};

/** Mean of 1-5 criteria mapped onto 0-100, so the same rubric always gives the same score. */
export function rubricScore(scores: number[]): number | null {
  if (!scores.length) return null;
  const clamped = scores.map((s) => Math.min(5, Math.max(1, s)));
  const mean = clamped.reduce((a, b) => a + b, 0) / clamped.length;
  return Math.round(((mean - 1) / 4) * 100);
}

/** What the scoring model returns (each criterion 1-5 with one line of evidence). */
export const ScoringSchema = z.object({
  rubric: z
    .array(z.object({ key: z.string(), score: z.number().int().min(1).max(5), evidence: z.string().max(300) }))
    .min(1)
    .max(8),
  strengths: z.array(z.string().max(300)).min(1).max(3),
  improvements: z.array(z.string().max(300)).min(1).max(3),
});

export type RubricRow = { key: string; label: string; score: number; evidence: string };
export type Scored = { rubric: RubricRow[]; score: number; strengths: string[]; improvements: string[] };

/** The model's scoring in the type's rubric order, or null if a criterion is missing. */
export function scoredMock(type: MockType, raw: z.infer<typeof ScoringSchema>): Scored | null {
  const byKey = new Map(raw.rubric.map((r) => [r.key, r]));
  const rubric: RubricRow[] = [];
  for (const c of RUBRIC[type]) {
    const r = byKey.get(c.key);
    if (!r) return null;
    rubric.push({ key: c.key, label: c.label, score: r.score, evidence: r.evidence.trim() });
  }
  const score = rubricScore(rubric.map((r) => r.score));
  if (score == null) return null;
  return { rubric, score, strengths: raw.strengths, improvements: raw.improvements };
}

const bullets = (items: string[]) => items.map((i) => `- ${i}`).join("\n");

export function feedbackMarkdown(s: Scored): string {
  return [
    `Score: **${s.score}/100**`,
    `## Rubric\n\n${bullets(s.rubric.map((r) => `${r.label}: ${r.score}/5. ${r.evidence}`))}`,
    `## Strengths\n\n${bullets(s.strengths)}`,
    `## To improve\n\n${bullets(s.improvements)}`,
  ].join("\n\n");
}

/** Common behavioral questions; each maps to story tags that usually answer it. */
export const BEHAVIORAL_QUESTIONS = [
  "Tell me about a time you disagreed with a teammate.",
  "Tell me about a project you're most proud of.",
  "Tell me about a time you failed.",
  "Tell me about a time you had to deliver with unclear requirements.",
  "Tell me about a time you led without authority.",
  "Tell me about a time you made a decision with incomplete data.",
  "Tell me about a time you had a tight deadline.",
  "Tell me about a time you received tough feedback.",
] as const;

/** The interviewer's first message, stored when the mock starts so the thread opens with it. */
export function openingMessage(type: MockType, topic: string): string {
  if (type === "behavioral") {
    return `This is a ${mockMinutes(type)}-minute behavioral interview. Take your time, and answer with a real example.\n\n${topic}`;
  }
  return `This is a ${mockMinutes(type)}-minute system design interview. Today: **${topic}**.\n\nStart with requirements: what should it do, and at what scale?`;
}

/** The mock's conversation in the coach chat (the chat opens /coach?kind=&ref=). */
export function mockThreadHref(mockId: string, threadId: string | null): string {
  return `/coach?kind=mock&ref=${mockId}${threadId ? `&thread=${threadId}` : ""}`;
}
