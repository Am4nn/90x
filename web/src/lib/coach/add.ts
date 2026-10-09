import "server-only";
import { randomUUID } from "node:crypto";
import { generateText, type LanguageModel, Output, stepCountIs, tool } from "ai";
import { and, desc, eq, inArray, lte } from "drizzle-orm";
import { after } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { campaigns, checkins, coachMessages, missions, problems, profiles, topicProgress, topics } from "@/db/schema";
import { fastModel, NO_THINKING } from "@/lib/ai";
import { trackFailedUsage } from "@/lib/ai/failed-usage";
import { aiGate, refusal } from "@/lib/ai/guard";
import { OUTPUT_TOKENS } from "@/lib/ai/limits";
import { AREA_LABEL, type FeedArea } from "@/lib/feed/view";
import { listedProblem } from "@/lib/library/listed";
import { logError } from "@/lib/log";
import { parseFocus } from "@/lib/tracker/campaign-rules";
import { localDate } from "@/lib/tracker/dates";
import { type Db, ensureToday, TOPIC_AREAS } from "@/lib/tracker/service";
import { SLOT_MINUTES } from "@/lib/tracker/template";
import {
  ADD_SYSTEM,
  type AddAnswer,
  AddModelAnswer,
  type AddPick,
  addContextBlock,
  addReason,
  clampAnswer,
  withLeftOut,
  lastMessages,
  uniquePicks,
} from "./add-rules";
import { memoryForPrompt } from "./memory";
import { trackCoachUsage } from "./model";
import { SCOPE_RULE } from "./prompt-safety";
import { type AddItem, parseProposal } from "./proposals";
import { takeMessageSlot } from "./rate-limit";
import { extractThread, findOrCreateDayThread, findThread, lockAdd, previousAddThread, saveMessage, threadMessages } from "./threads";
import { findProblemsData, findTopicsData, weakSpotsData } from "./tools-data";

// "Add with Coach": one fast-model turn that picks up to three Extras, the picks
// re-checked in SQL, the answer saved in the day's hidden `add` thread as a text part and an
// `add_extras` proposal part. Owner-only: every query is scoped to the userId passed in.

const TOOL_PART = "tool-add_extras";
const MAX_STEPS = 3;
const COULDNT = "Coach couldn't answer that. Try again.";

export type AddMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  proposal: { toolCallId: string; items: AddItem[]; status?: "confirmed" | "dismissed" } | null;
};

type Part = { type?: string; text?: string; toolCallId?: string; output?: unknown };

async function companiesOf(userId: string, q: Db): Promise<string[]> {
  const [row] = await q
    .select({ focus: campaigns.companyFocus })
    .from(campaigns)
    .where(and(eq(campaigns.userId, userId), eq(campaigns.status, "active")))
    .limit(1);
  return parseFocus(row?.focus)?.companies ?? [];
}

function problemMeta(row: { pattern: string | null; difficulty: string; companies: unknown }, focus: string[]): string {
  const asked = Object.keys((row.companies ?? {}) as Record<string, unknown>).map((c) => c.toLowerCase());
  const named = focus.filter((c) => asked.includes(c.toLowerCase())).slice(0, 2);
  return [row.pattern ?? "DSA", row.difficulty.toLowerCase(), ...(named.length ? [`asked at ${named.join(", ")}`] : [])].join(" · ");
}

/** The picks that may be added: real, listed, unsolved (problems), unstudied (topics), not already open. Order kept. */
export async function validatePicks(userId: string, picks: AddPick[], hasPremium: boolean, today: string, q: Db = db): Promise<AddItem[]> {
  const out: AddItem[] = [];
  const focus = await companiesOf(userId, q);
  for (const p of uniquePicks(picks)) {
    const open = await q
      .select({ id: missions.id })
      .from(missions)
      .where(and(eq(missions.userId, userId), eq(missions.ref, p.ref), eq(missions.status, "open"), lte(missions.date, today)))
      .limit(1);
    if (open.length) continue;
    if (p.kind === "problem") {
      const [row] = await q
        .select({
          slug: problems.slug,
          title: problems.title,
          difficulty: problems.difficulty,
          premium: problems.premium,
          pattern: topics.name,
          companies: problems.companies,
        })
        .from(problems)
        .leftJoin(topics, eq(topics.slug, problems.patternSlug))
        .where(and(eq(problems.slug, p.ref), eq(problems.kind, "leetcode"), listedProblem));
      if (!row || (row.premium && !hasPremium)) continue;
      const [last] = await q
        .select({ result: checkins.result })
        .from(checkins)
        .where(and(eq(checkins.userId, userId), eq(checkins.problemSlug, p.ref)))
        .orderBy(desc(checkins.createdAt))
        .limit(1);
      if (last?.result === "solved") continue;
      out.push({
        slotType: "new_problem",
        ref: row.slug,
        title: row.title,
        why: p.why,
        estMinutes: SLOT_MINUTES.new_problem,
        area: "dsa",
        meta: problemMeta(row, focus),
      });
    } else {
      const [row] = await q
        .select({ slug: topics.slug, name: topics.name, domain: topics.domain })
        .from(topics)
        .where(and(eq(topics.slug, p.ref), inArray(topics.domain, [...TOPIC_AREAS])));
      if (!row) continue;
      // Studied means a topic_progress row: the same rule as unstudiedTopics.
      const studied = await q
        .select({ slug: topicProgress.topicSlug })
        .from(topicProgress)
        .where(and(eq(topicProgress.userId, userId), eq(topicProgress.topicSlug, row.slug)))
        .limit(1);
      if (studied.length) continue;
      out.push({
        slotType: "topic",
        ref: row.slug,
        title: row.name,
        why: p.why,
        estMinutes: SLOT_MINUTES.topic,
        area: row.domain,
        meta: `${AREA_LABEL[row.domain as FeedArea] ?? row.domain} · topic`,
      });
    }
  }
  return out;
}

/**
 * Confirm a saved proposal's items, or the ticked subset of them. Each item is checked again
 * (solved or opened since it was proposed means skipped) and goes in as an Extra for today.
 * Extras never change the day, so there is no refreshDay.
 */
export async function confirmAddItems(
  userId: string,
  items: AddItem[],
  choose: string[] | undefined,
  q: Db,
): Promise<{ note: string; href: string; added: string[] } | { error: string }> {
  const refs = [...new Set(choose ?? [])];
  if (choose && (!refs.length || refs.length > 3 || refs.some((r) => !items.some((i) => i.ref === r)))) {
    return { error: "That suggestion can't be used." };
  }
  const chosen = refs.length ? items.filter((i) => refs.includes(i.ref)) : items;
  const [p] = await q
    .select({ timezone: profiles.timezone, hasPremium: profiles.hasLeetcodePremium })
    .from(profiles)
    .where(eq(profiles.userId, userId));
  const today = localDate(p?.timezone ?? "UTC");
  const still = await validatePicks(
    userId,
    chosen.map((i) => ({ kind: i.slotType === "topic" ? ("topic" as const) : ("problem" as const), ref: i.ref, why: i.why })),
    p?.hasPremium ?? false,
    today,
    q,
  );
  const added: string[] = [];
  for (const item of still) {
    const inserted = await q
      .insert(missions)
      .values({
        userId,
        date: today,
        slotType: item.slotType,
        ref: item.ref,
        estMinutes: item.estMinutes,
        status: "open",
        reason: addReason(item.meta),
        isExtra: true,
      })
      .onConflictDoNothing()
      .returning({ id: missions.id });
    if (inserted.length) added.push(item.ref);
  }
  if (!added.length) return { error: "Those are done already." };
  return { note: `Added ${added.length} to Extras.`, href: "/today", added };
}

const textOf = (parts: unknown[]) =>
  (parts as Part[])
    .filter((p) => p.type === "text")
    .map((p) => p.text ?? "")
    .join("");

function toAddMessage(m: { id: string; role: "user" | "assistant"; parts: unknown[] }): AddMessage {
  const part = (m.parts as Part[]).find((p) => p.type === TOOL_PART && p.toolCallId);
  const parsed = part ? parseProposal(part.output) : null;
  const proposal =
    part?.toolCallId && parsed?.proposal.type === "add_extras"
      ? {
          toolCallId: part.toolCallId,
          // A confirmed proposal lists only what was really added; older rows without `added` keep every item.
          items:
            parsed.status === "confirmed" && parsed.added
              ? parsed.proposal.payload.items.filter((i) => parsed.added?.includes(i.ref))
              : parsed.proposal.payload.items,
          status: parsed.status,
        }
      : null;
  return { id: m.id, role: m.role, text: textOf(m.parts), proposal };
}

/**
 * The day's thread for display (it is not created here): every message, oldest first, and how many sit
 * above the last 6. The panel shows the last 6 and folds the rest behind "Earlier · N messages".
 */
export async function addThreadView(
  userId: string,
  today: string,
): Promise<{ threadId: string | null; messages: AddMessage[]; earlier: number }> {
  const thread = await findThread(userId, "add", today);
  if (!thread) return { threadId: null, messages: [], earlier: 0 };
  const all = await threadMessages(userId, thread.id, 200);
  return { threadId: thread.id, messages: all.map(toAddMessage), earlier: Math.max(0, all.length - 6) };
}

const undecided = (p: Part) => p.type === TOOL_PART && !parseProposal(p.output)?.status;

/** Mark every still-undecided add_extras proposal in the thread dismissed: a newer one replaces it. */
async function dismissOlder(userId: string, threadId: string, q: Db) {
  for (const m of await threadMessages(userId, threadId, 200, q)) {
    const parts = m.parts as Part[];
    if (!parts.some(undecided)) continue;
    const next = parts.map((p) => (undecided(p) ? { ...p, output: { ...(p.output as object), status: "dismissed" } } : p));
    await q
      .update(coachMessages)
      .set({ parts: next })
      .where(and(eq(coachMessages.id, m.id), eq(coachMessages.userId, userId)));
  }
}

/** Save the model's answer: dismiss an older open proposal, then the text and (when any pick survived) a new proposal. */
export async function saveAddAnswer(userId: string, threadId: string, say: string, items: AddItem[], q: Db = db): Promise<AddMessage> {
  const parts: unknown[] = [
    { type: "text", text: say },
    ...(items.length
      ? [
          {
            type: TOOL_PART,
            toolCallId: randomUUID(),
            state: "output-available",
            output: { proposal: { type: "add_extras", summary: `Add ${items.length} to Extras`, payload: { items } } },
          },
        ]
      : []),
  ];
  const message = { id: randomUUID(), role: "assistant" as const, parts };
  // One transaction under the user's Add lock: two answers landing together cannot both leave a proposal undecided.
  await q.transaction(async (tx) => {
    await lockAdd(userId, tx);
    await dismissOlder(userId, threadId, tx);
    await saveMessage(userId, threadId, message, tx);
  });
  return toAddMessage(message);
}

/** The pattern names this person is weakest on, up to 3: failures first, then least solved. */
export async function weakestPatterns(userId: string): Promise<string[]> {
  const { patterns } = await weakSpotsData(userId);
  return patterns
    .filter((p) => p.total > 0 && p.solved < p.total)
    .toSorted((a, b) => b.failed - a.failed || a.solved / a.total - b.solved / b.total)
    .slice(0, 3)
    .map((p) => p.name);
}

/** What the model is told an earlier answer said: its text, and the items it proposed so a refine can change them. */
function historyText(m: { parts: unknown[] }): string {
  const proposed = toAddMessage({ id: "", role: "assistant", parts: m.parts }).proposal;
  const say = textOf(m.parts);
  return proposed
    ? `${say}
Proposed: ${proposed.items.map((i) => `${i.title} (${i.ref})`).join(", ")}`
    : say;
}

export async function addTurn(
  userId: string,
  text: string,
  deps: { model?: LanguageModel } = {},
): Promise<{ error: string } | { ok: true; message: AddMessage }> {
  const view = await ensureToday(userId);
  if (view.state !== "active") return { error: "Start a plan first (Me → Plan)." };
  const { today } = view;
  const gate = await aiGate(userId);
  if (!gate.allowed) return { error: refusal(gate) };
  if (!(await takeMessageSlot(userId)).allowed) return { error: "Give Coach a minute, then try again." };

  const [profile] = await db
    .select({ hasPremium: profiles.hasLeetcodePremium, level: profiles.level })
    .from(profiles)
    .where(eq(profiles.userId, userId));
  const thread = await findOrCreateDayThread(userId, today);
  if (thread.created) {
    after(async () => {
      try {
        const prev = await previousAddThread(userId, today);
        if (prev) await extractThread(userId, prev.id);
      } catch (e) {
        logError("add thread memory extraction failed", e);
      }
    });
  }
  await saveMessage(userId, thread.id, { id: randomUUID(), role: "user", parts: [{ type: "text", text }] });

  const saved = await threadMessages(userId, thread.id, 30);
  const addedToday = saved.flatMap((m) => {
    const p = toAddMessage(m).proposal;
    return p?.status === "confirmed" ? p.items.map((i) => i.title) : [];
  });
  const [memory, weakPatterns] = await Promise.all([memoryForPrompt(userId), weakestPatterns(userId)]);
  const ctx = {
    memory,
    level: profile?.level ?? null,
    today: view.missions.map((m) => ({ title: m.title, kind: m.slotType })),
    extras: view.extras.filter((x) => x.status === "open").map((x) => ({ title: x.title })),
    weakPatterns,
    companies: view.campaign.companyFocus?.companies ?? [],
    addedToday,
  };
  const messages = lastMessages(saved)
    .map((m) => ({ role: m.role, content: m.role === "assistant" ? historyText(m) : textOf(m.parts) }))
    .filter((m) => m.content);

  let answer: AddAnswer;
  // Inside the try, so a missing model setting still ends in the friendly error.
  let model: LanguageModel | undefined;
  try {
    model = deps.model ?? fastModel();
    const result = await generateText({
      model,
      system: `${ADD_SYSTEM}\n\n${addContextBlock(ctx)}\n\n${SCOPE_RULE}`,
      messages,
      tools: {
        find_problems: tool({
          description: "Find unsolved LeetCode problems by pattern, difficulty and company. Up to 10, most important first.",
          inputSchema: z.object({
            pattern: z.string().max(60).optional(),
            difficulty: z.enum(["Easy", "Medium", "Hard"]).optional(),
            company: z.string().max(60).optional(),
          }),
          execute: async (f) => findProblemsData(userId, { ...f, status: "unsolved", limit: 10 }),
        }),
        find_topics: tool({
          description: "Find study topics outside DSA (system design, CS, Java, SQL) the user hasn't studied, optionally matching words.",
          inputSchema: z.object({ area: z.enum(TOPIC_AREAS).optional(), query: z.string().max(60).optional() }),
          execute: async (f) => findTopicsData(userId, f),
        }),
      },
      stopWhen: stepCountIs(MAX_STEPS),
      // The last step must answer: a run that ends on a bare tool call has no output and the turn would fail.
      prepareStep: ({ stepNumber }) => (stepNumber >= MAX_STEPS - 1 ? { toolChoice: "none" } : undefined),
      output: Output.object({ schema: AddModelAnswer }),
      maxOutputTokens: OUTPUT_TOKENS.add,
      providerOptions: NO_THINKING,
    });
    await trackCoachUsage(userId, "coach.add", model, result);
    answer = clampAnswer(result.output);
  } catch (e) {
    if (model) await trackFailedUsage(userId, "coach.add", model, e);
    logError("add with coach failed", e);
    return { error: COULDNT };
  }

  const items = await validatePicks(userId, answer.picks, profile?.hasPremium ?? false, today);
  return { ok: true, message: await saveAddAnswer(userId, thread.id, withLeftOut(answer.say, answer.picks.length, items.length), items) };
}
