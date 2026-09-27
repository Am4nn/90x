import "server-only";
import { generateText, Output } from "ai";
import { and, asc, desc, eq, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { coachMessages, coachThreads, mockDetails, mocks, topics } from "@/db/schema";
import { NO_THINKING } from "@/lib/ai";
import { extractMemory } from "./memory";
import {
  BEHAVIORAL_QUESTIONS,
  feedbackMarkdown,
  type MockType,
  openingMessage,
  RUBRIC,
  type RubricRow,
  scoredMock,
  ScoringSchema,
} from "./mock-rules";
import { coachModel, trackCoachUsage } from "./model";

// Mock interviews: start, read, and score. Every query is scoped to one user
// id; friends see only the public `mocks` row (type, topic, score), through
// lib/tracker/me.ts.

const CASE_STUDIES = "sd-design-case-studies";
const TOPIC_LIMIT = 24;

/** Design mock topics: the case studies first, then the most important concepts. */
export async function designTopics(): Promise<string[]> {
  const rows = await db
    .select({ name: topics.name })
    .from(topics)
    .where(and(eq(topics.domain, "system_design"), ne(topics.slug, CASE_STUDIES)))
    .orderBy(sql`coalesce(${topics.parentSlug} = ${CASE_STUDIES}, false) desc`, desc(topics.importance), asc(topics.sort))
    .limit(TOPIC_LIMIT);
  return rows.map((r) => r.name);
}

export async function listMocks(userId: string, limit = 20) {
  return db
    .select({ id: mocks.id, type: mocks.type, topic: mocks.topic, status: mocks.status, score: mocks.score, startedAt: mocks.startedAt })
    .from(mocks)
    .where(eq(mocks.userId, userId))
    .orderBy(desc(mocks.startedAt))
    .limit(limit);
}

type SavedRubric = { rubric: RubricRow[]; strengths: string[]; improvements: string[] };

/** One of the user's mocks with its private details, or null. */
export async function mockView(userId: string, mockId: string) {
  const [row] = await db
    .select({
      id: mocks.id,
      type: mocks.type,
      topic: mocks.topic,
      status: mocks.status,
      score: mocks.score,
      startedAt: mocks.startedAt,
      endedAt: mocks.endedAt,
      threadId: mockDetails.threadId,
      prompt: mockDetails.prompt,
      rubricScores: mockDetails.rubricScores,
    })
    .from(mocks)
    .leftJoin(mockDetails, and(eq(mockDetails.mockId, mocks.id), eq(mockDetails.userId, userId)))
    .where(and(eq(mocks.id, mockId), eq(mocks.userId, userId)));
  if (!row) return null;
  const saved = row.rubricScores as Partial<SavedRubric> | null;
  return {
    ...row,
    type: row.type as MockType,
    rubric: Array.isArray(saved?.rubric) ? saved.rubric : [],
    strengths: Array.isArray(saved?.strengths) ? saved.strengths : [],
    improvements: Array.isArray(saved?.improvements) ? saved.improvements : [],
  };
}

export type StartResult = { mockId: string; threadId: string } | { error: string };

/**
 * Starts a mock: the public row, its private details, a coach thread (kind
 * mock, ref = mock id) and the interviewer's opening message. Any other mock
 * still running is marked abandoned, so there is one at a time.
 */
export async function startMock(userId: string, type: MockType, topic: string): Promise<StartResult> {
  const allowed = type === "design" ? await designTopics() : [...BEHAVIORAL_QUESTIONS];
  if (!allowed.includes(topic)) return { error: "Pick a topic from the list." };
  const opening = openingMessage(type, topic);
  return db.transaction(async (tx) => {
    const now = new Date().toISOString();
    await tx
      .update(mocks)
      .set({ status: "abandoned", endedAt: now })
      .where(and(eq(mocks.userId, userId), eq(mocks.status, "running")));
    const [mock] = await tx.insert(mocks).values({ userId, type, topic }).returning({ id: mocks.id });
    if (!mock) throw new Error("mock insert returned nothing");
    const [thread] = await tx
      .insert(coachThreads)
      .values({ userId, kind: "mock", ref: mock.id, title: `Mock: ${topic}`.slice(0, 120) })
      .returning({ id: coachThreads.id });
    if (!thread) throw new Error("thread insert returned nothing");
    await tx.insert(mockDetails).values({ mockId: mock.id, userId, threadId: thread.id, prompt: opening });
    await tx.insert(coachMessages).values({ threadId: thread.id, userId, role: "assistant", parts: [{ type: "text", text: opening }] });
    return { mockId: mock.id, threadId: thread.id };
  });
}

function textOf(parts: unknown): string {
  if (!Array.isArray(parts)) return "";
  return parts
    .filter((p): p is { type: "text"; text: string } => p?.type === "text" && typeof p.text === "string")
    .map((p) => p.text)
    .join("\n");
}

/** The mock's conversation as plain text, from every mock thread that points at it. */
async function transcript(userId: string, mockId: string, threadId: string | null) {
  const threads = await db
    .select({ id: coachThreads.id })
    .from(coachThreads)
    .where(
      and(
        eq(coachThreads.userId, userId),
        or(and(eq(coachThreads.kind, "mock"), eq(coachThreads.ref, mockId)), threadId ? eq(coachThreads.id, threadId) : undefined),
      ),
    );
  if (!threads.length) return { text: "", answered: false };
  const rows = await db
    .select({ role: coachMessages.role, parts: coachMessages.parts })
    .from(coachMessages)
    .where(
      and(
        eq(coachMessages.userId, userId),
        inArray(
          coachMessages.threadId,
          threads.map((t) => t.id),
        ),
      ),
    )
    .orderBy(asc(coachMessages.createdAt));
  const lines = rows.map((r) => ({ role: r.role, text: textOf(r.parts).trim() })).filter((r) => r.text);
  return {
    text: lines.map((l) => `${l.role === "user" ? "Candidate" : "Interviewer"}: ${l.text}`).join("\n\n"),
    answered: lines.some((l) => l.role === "user"),
  };
}

const SCORING_SYSTEM = `You score a text mock interview for a software engineer. Be fair and specific.
Score only what the candidate wrote; the interviewer's messages give context but earn nothing.
Each criterion is 1-5: 1 missing, 2 weak, 3 adequate for a mid-level engineer, 4 good, 5 strong senior answer.
Evidence is one line pointing at what they said or left out.
Give exactly 3 strengths and 3 improvements, each one sentence, specific to this transcript.
If the candidate barely answered, score low and say so.`;

const SCORING_LOCK_MS = 2 * 60_000;

export type EndResult = { ok: true; scored: boolean } | { error: string };

/**
 * Ends a running mock and scores it (button, end_mock confirm or
 * timer). A mock nobody answered is marked abandoned instead. ended_at doubles
 * as a short lock so the timer and the button don't score twice.
 */
export async function endMock(userId: string, mockId: string): Promise<EndResult> {
  const mock = await mockView(userId, mockId);
  if (!mock) return { error: "That mock isn't yours or doesn't exist." };
  if (mock.status !== "running") return { ok: true, scored: mock.score != null };

  const now = new Date();
  const [claimed] = await db
    .update(mocks)
    .set({ endedAt: now.toISOString() })
    .where(
      and(
        eq(mocks.id, mockId),
        eq(mocks.userId, userId),
        eq(mocks.status, "running"),
        or(isNull(mocks.endedAt), lt(mocks.endedAt, new Date(now.getTime() - SCORING_LOCK_MS).toISOString())),
      ),
    )
    .returning({ id: mocks.id });
  if (!claimed) return { error: "Already scoring this mock. Give it a moment." };

  try {
    const convo = await transcript(userId, mockId, mock.threadId);
    if (!convo.answered) {
      await db
        .update(mocks)
        .set({ status: "abandoned" })
        .where(and(eq(mocks.id, mockId), eq(mocks.userId, userId)));
      return { ok: true, scored: false };
    }

    const criteria = RUBRIC[mock.type].map((c) => `${c.key} (${c.label})`).join(", ");
    const { model } = await coachModel();
    const result = await generateText({
      model,
      system: SCORING_SYSTEM,
      prompt: `Mock type: ${mock.type}\nTopic: ${mock.topic}\nCriteria keys, use exactly these: ${criteria}\n\nTranscript:\n${convo.text.slice(0, 30000)}`,
      output: Output.object({ schema: ScoringSchema }),
      temperature: 0,
      providerOptions: NO_THINKING,
    });
    await trackCoachUsage(userId, "coach.mock.score", model, result.usage);
    const scored = scoredMock(mock.type, result.output);
    if (!scored) throw new Error("scoring missed a rubric criterion");

    const feedback = feedbackMarkdown(scored);
    const saved: SavedRubric = { rubric: scored.rubric, strengths: scored.strengths, improvements: scored.improvements };
    await db.transaction(async (tx) => {
      await tx
        .update(mockDetails)
        .set({ rubricScores: saved, feedbackMd: feedback })
        .where(and(eq(mockDetails.mockId, mockId), eq(mockDetails.userId, userId)));
      await tx
        .update(mocks)
        .set({ score: scored.score, status: "done", endedAt: new Date().toISOString() })
        .where(and(eq(mocks.id, mockId), eq(mocks.userId, userId)));
    });
    await extractMemory(userId, { kind: "mock", id: mockId }, `${convo.text}\n\nFeedback:\n${feedback}`);
    return { ok: true, scored: true };
  } catch (e) {
    // Release the lock so the user can try again right away.
    await db
      .update(mocks)
      .set({ endedAt: null })
      .where(and(eq(mocks.id, mockId), eq(mocks.userId, userId), eq(mocks.status, "running")));
    throw e;
  }
}
