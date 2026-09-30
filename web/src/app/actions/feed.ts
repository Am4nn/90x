"use server";

import { z } from "zod";
import type { FormState } from "@/components/form";
import { requireViewer } from "@/lib/auth/viewer";
import { DIFFICULTY_PREFERENCES } from "@/lib/feed/difficulty";
import { reportCard } from "@/lib/feed/flag-service";
import {
  answerCard,
  retireTopic,
  emptyReason,
  nextCard,
  sessionStats,
  setDifficultyPreference,
  setFeedAreas,
  skipDiagnostic,
  startDiagnostic,
  upcomingCards,
} from "@/lib/feed/service";
import { type AnswerResult, type CardView, type EmptyReason, FEED_AREAS, type SessionStats } from "@/lib/feed/view";

// Feed actions. Each returns data or a short error and never throws to the UI.

export type NextCardState = { card: CardView } | { empty: EmptyReason } | { error: string };
export type AnswerState =
  | { result: AnswerResult; session: SessionStats }
  | { needsSelfMark: true }
  /** This answer's clientId was already graded (an offline answer sent again). */
  | { duplicate: true }
  /** `retry`: the server failed, not the answer, so a queued offline answer should wait and try again. */
  | { error: string; retry?: true };
export type UpcomingState = { cards: CardView[] } | { error: string };

const cardId = z.uuid();
const clientId = z.uuid().optional();
// Strict objects, so a shaped answer that also carries a typed string can't match
// the plain-answer shape. `why` only ever rides the four shaped answers.
const shaped = { cardId, clientId, why: z.int().min(0).max(20).optional() };
const answerInput = z.union([
  z.strictObject({ cardId, clientId, skipped: z.literal(true) }),
  z.strictObject({ cardId, clientId, selfMark: z.enum(["got", "missed"]), answer: z.string().max(4000).optional() }),
  z.strictObject({ cardId, clientId, declare: z.enum(["new_to_me", "known"]) }),
  z.strictObject({ ...shaped, shape: z.literal("chosen"), picked: z.array(z.int()).min(1).max(20) }),
  z.strictObject({ ...shaped, shape: z.literal("ordered"), order: z.array(z.int()).min(1).max(20) }),
  z.strictObject({
    ...shaped,
    shape: z.literal("mapping"),
    pairs: z
      .array(z.tuple([z.int(), z.int()]))
      .min(1)
      .max(20),
  }),
  z.strictObject({ ...shaped, shape: z.literal("number"), value: z.number() }),
]);

async function cardOrEmpty(userId: string, card: CardView | null): Promise<NextCardState> {
  return card ? { card } : { empty: await emptyReason(userId) };
}

export async function getNextCard(): Promise<NextCardState> {
  const viewer = await requireViewer();
  try {
    return await cardOrEmpty(viewer.id, await nextCard(viewer.id));
  } catch (e) {
    console.error("next card failed", e);
    return { error: "The next card didn't load. Try again." };
  }
}

export async function submitAnswer(input: unknown): Promise<AnswerState> {
  const viewer = await requireViewer();
  const parsed = answerInput.safeParse(input);
  if (!parsed.success) return { error: "Type an answer first." };
  try {
    const result = await answerCard(viewer.id, parsed.data);
    if (!result) return { error: "That card is no longer in the feed. Go to the next one." };
    if ("needsSelfMark" in result || "duplicate" in result) return result;
    // "I already know this" is earned: the reader has not answered enough of
    // this topic yet, and the button should not have been offered.
    if ("notEligible" in result) return { error: "Answer a few more cards on this topic first." };
    return { result, session: await sessionStats(viewer.id) };
  } catch (e) {
    console.error("answer failed", e);
    return { error: "Your answer didn't save. Try again.", retry: true };
  }
}

/** Retire the rest of a topic the reader has proved they know. Offered after
 *  "I already know this", never taken automatically. */
export async function retireTopicAction(topicSlug: string): Promise<{ retired: number } | { error: string }> {
  const viewer = await requireViewer();
  if (!/^[a-z0-9-]{1,120}$/.test(topicSlug)) return { error: "Unknown topic." };
  try {
    return { retired: await retireTopic(viewer.id, topicSlug) };
  } catch (e) {
    console.error("retire topic failed", e);
    return { error: "That didn't save. Try again." };
  }
}

/** The next cards, for the browser to keep so the Feed works offline. */
export async function getUpcomingCards(): Promise<UpcomingState> {
  const viewer = await requireViewer();
  try {
    return { cards: await upcomingCards(viewer.id) };
  } catch (e) {
    console.error("upcoming cards failed", e);
    return { error: "Cards for offline use didn't load." };
  }
}

export async function reportCardAction(id: string, reason: string): Promise<FormState> {
  const viewer = await requireViewer();
  const parsed = z.object({ id: cardId, reason: z.string().trim().min(1).max(500) }).safeParse({ id, reason });
  if (!parsed.success) return { error: "Say what's wrong in a few words." };
  try {
    await reportCard(viewer.id, parsed.data.id, parsed.data.reason);
    return { ok: true, note: "Thanks. We'll take a look." };
  } catch (e) {
    console.error("report failed", e);
    return { error: "The report didn't send. Try again." };
  }
}

export async function saveFeedAreas(areas: string[]): Promise<FormState> {
  const viewer = await requireViewer();
  const parsed = z.array(z.enum(FEED_AREAS)).min(1).max(FEED_AREAS.length).safeParse(areas);
  if (!parsed.success) return { error: "Keep at least one topic on." };
  try {
    await setFeedAreas(
      viewer.id,
      FEED_AREAS.filter((area) => parsed.data.includes(area)),
    );
    return { ok: true };
  } catch (e) {
    console.error("feed areas not saved", e);
    return { error: "That didn't save. Try again." };
  }
}

export async function saveDifficultyPreference(preference: string): Promise<FormState> {
  const viewer = await requireViewer();
  const parsed = z.enum(DIFFICULTY_PREFERENCES).safeParse(preference);
  if (!parsed.success) return { error: "Pick a difficulty." };
  try {
    await setDifficultyPreference(viewer.id, parsed.data);
    return { ok: true };
  } catch (e) {
    console.error("difficulty preference not saved", e);
    return { error: "That didn't save. Try again." };
  }
}

export async function startDiagnosticAction(): Promise<NextCardState> {
  const viewer = await requireViewer();
  try {
    return await cardOrEmpty(viewer.id, (await startDiagnostic(viewer.id)) ?? (await nextCard(viewer.id)));
  } catch (e) {
    console.error("diagnostic start failed", e);
    return { error: "The diagnostic didn't start. Try again." };
  }
}

export async function skipDiagnosticAction(): Promise<NextCardState> {
  const viewer = await requireViewer();
  try {
    await skipDiagnostic(viewer.id);
    return await cardOrEmpty(viewer.id, await nextCard(viewer.id));
  } catch (e) {
    console.error("diagnostic skip failed", e);
    return { error: "That didn't save. Try again." };
  }
}
