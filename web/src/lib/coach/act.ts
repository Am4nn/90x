import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { coachMessages, missions, profiles } from "@/db/schema";
import { queueFirst } from "@/lib/feed/service";
import { activeCampaign, setTemplates } from "@/lib/tracker/campaign";
import { localDate } from "@/lib/tracker/dates";
import { type Db, refreshDay } from "@/lib/tracker/service";
import { addFact, editFact } from "./memory-edit";
import { queueProblems } from "./missions";
import { mockThreadHref } from "./mock-rules";
import { endMock, startMock } from "./mocks";
import { applyTemplateChanges, type Proposal, type ProposalStatus, parseProposal } from "./proposals";
import { activeTemplates, problemBySlug, topicBySlugOrName } from "./tools-data";

// Performs a proposal the user confirmed in the chat (nothing
// changes until they tap). The proposal is read back from the saved assistant
// message, not taken from the client, and validated again before it runs.

type Done = { note?: string; href?: string };
type Outcome = { ok: true; status: ProposalStatus; note?: string; href?: string } | { error: string };

async function queueCards(userId: string, cardIds: string[], q: Db): Promise<Done | { error: string }> {
  // The Feed owns its queue. This used to write the Redis list here with its own
  // copy of the key, the lifetime and the entry encoding, and the copy had
  // drifted: it left the card already on screen in front of these, and it counted
  // cards from areas the reader had switched off, which `nextCard` then dropped -
  // so the Coach could report three cards added and serve none.
  const ids = await queueFirst(userId, cardIds, q);
  if (!ids.length) return { error: "Those cards aren't in the feed any more." };
  return { note: `${ids.length} card${ids.length === 1 ? "" : "s"} added to the front of your feed.` };
}

async function addMission(userId: string, payload: Extract<Proposal, { type: "add_mission" }>["payload"], q: Db) {
  const exists =
    payload.slotType === "topic"
      ? await topicBySlugOrName(payload.ref, q)
      : await problemBySlug(payload.ref, q, { listed: payload.slotType === "new_problem" });
  if (!exists) return { error: "That item isn't in the library any more." };
  if (!(await activeCampaign(userId))) return { error: "Start a campaign first (Me → Plan)." };
  const [p] = await q.select({ timezone: profiles.timezone }).from(profiles).where(eq(profiles.userId, userId));
  const today = localDate(p?.timezone ?? "UTC");
  const inserted = await q
    .insert(missions)
    .values({
      userId,
      date: today,
      slotType: payload.slotType,
      ref: payload.ref,
      estMinutes: payload.estMinutes,
      status: "open",
      reason: "Added by Coach",
      isExtra: true,
    })
    .onConflictDoNothing()
    .returning({ id: missions.id });
  if (!inserted.length) return { error: "That's already on today's list." };
  await refreshDay(userId, today, q);
  return { note: "Added to today.", href: "/today" };
}

async function perform(userId: string, proposal: Proposal, q: Db): Promise<Done | { error: string }> {
  switch (proposal.type) {
    case "queue_cards":
      return queueCards(userId, proposal.payload.cardIds, q);
    case "add_mission":
      return addMission(userId, proposal.payload, q);
    case "suggest_template_change": {
      const current = await activeTemplates(userId, q);
      if (!current) return { error: "Start a campaign first (Me → Plan)." };
      const next = applyTemplateChanges(current, proposal.payload.changes);
      if ("error" in next) return next;
      const error = await setTemplates(userId, next.templates);
      return error ? { error } : { note: "Saved. Applies from tomorrow." };
    }
    case "save_memory": {
      const { id, kind, text } = proposal.payload;
      if (id) {
        if (!(await editFact(userId, id, { text, kind }, q))) return { error: "That fact is gone. Ask Coach again." };
      } else {
        await addFact(userId, kind, text, q);
      }
      return { note: "Saved. Coach will remember this." };
    }
    case "start_mock": {
      // startMock: ends any running mock, opens its thread with the interviewer's first question.
      const started = await startMock(userId, proposal.payload.type, proposal.payload.topic);
      if ("error" in started) return { error: "That topic isn't on the mock list. Pick one in Coach → Mocks." };
      return { href: mockThreadHref(started.mockId, started.threadId) };
    }
    case "end_mock": {
      const ended = await endMock(userId, proposal.payload.mockId);
      if ("error" in ended) return ended;
      return ended.scored
        ? { note: "Scored.", href: `/coach/mocks/${proposal.payload.mockId}` }
        : { note: "Ended without answers, so there's no score." };
    }
    case "queue_ladder": {
      const result = await queueProblems(userId, proposal.payload.slugs, "Queued from your pattern lesson");
      if ("error" in result) return result;
      if (!result.added) return { note: "Already on your plan." };
      return { note: result.today === result.added ? "Added to today." : "Added to your plan: the first today, the rest tomorrow." };
    }
  }
}

type Part = { type?: string; toolCallId?: string; output?: unknown };

/** Confirm (perform, then record) or dismiss (record) one proposal in a thread. Each can be decided once. */
export async function resolveProposal(
  userId: string,
  threadId: string,
  toolCallId: string,
  decision: "confirm" | "dismiss",
): Promise<Outcome> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ id: coachMessages.id, parts: coachMessages.parts })
      .from(coachMessages)
      .where(
        and(
          eq(coachMessages.threadId, threadId),
          eq(coachMessages.userId, userId),
          eq(coachMessages.role, "assistant"),
          sql`${coachMessages.parts} @> ${JSON.stringify([{ toolCallId }])}::jsonb`,
        ),
      )
      .for("update");
    const parts = (Array.isArray(row?.parts) ? row.parts : []) as Part[];
    const index = parts.findIndex((p) => p.toolCallId === toolCallId);
    const part = parts[index];
    const parsed = parseProposal(part?.output);
    if (!row || !part || !parsed) return { error: "That suggestion isn't available any more." };
    if (parsed.status) return { error: parsed.status === "confirmed" ? "Already done." : "You dismissed this one." };

    let done: Done = {};
    if (decision === "confirm") {
      const result = await perform(userId, parsed.proposal, tx);
      if ("error" in result) return result;
      done = result;
    }
    const status: ProposalStatus = decision === "confirm" ? "confirmed" : "dismissed";
    const next = parts.map((p, i) => (i === index ? { ...p, output: { ...(p.output as object), status } } : p));
    await tx
      .update(coachMessages)
      .set({ parts: next })
      .where(and(eq(coachMessages.id, row.id), eq(coachMessages.userId, userId)));
    return { ok: true, status, ...done };
  });
}
