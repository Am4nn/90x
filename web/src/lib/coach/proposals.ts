import { z } from "zod";
import type { Weekday } from "@/lib/tracker/dates";
import { MAX_PER_SLOT, parseTemplates, SLOT_TYPES, type SlotType, type Templates } from "@/lib/tracker/template";
import { MEMORY_KINDS } from "./memory-rules";

// Action tools only propose: each returns { proposal } and the
// chat shows a Confirm button. Confirming re-reads the proposal from the saved
// message and validates it here before anything changes, so a payload the
// model or the client made up never reaches the database unchecked.

const count = z.int().min(0).max(MAX_PER_SLOT);
const weekday = z.int().min(0).max(6);

const QueueCards = z.strictObject({ cardIds: z.array(z.uuid()).min(1).max(10) });
const AddMission = z.strictObject({
  slotType: z.enum(["new_problem", "review", "topic"]),
  ref: z.string().min(1).max(200),
  title: z.string().min(1).max(200),
  estMinutes: z.int().min(5).max(180),
});
const TemplateChange = z.strictObject({
  changes: z
    .array(z.strictObject({ weekday, slot: z.enum(SLOT_TYPES), from: count, to: count }))
    .min(1)
    .max(14),
});
const SaveMemory = z.strictObject({ id: z.uuid().nullable(), kind: z.enum(MEMORY_KINDS), text: z.string().trim().min(3).max(300) });
// The lesson's ladder (modes/lesson.ts): first problem today, the rest tomorrow.
const QueueLadder = z.strictObject({
  slugs: z
    .array(z.string().regex(/^[a-z0-9-]{1,200}$/))
    .min(1)
    .max(3),
});
// The interviewer's end_mock (modes/mock.ts).
const EndMock = z.strictObject({ mockId: z.uuid() });
const StartMock = z.strictObject({ type: z.enum(["design", "behavioral"]), topic: z.string().trim().min(1).max(200) });

const summary = z.string().min(1).max(300);
const ProposalSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("queue_cards"), summary, payload: QueueCards }),
  z.strictObject({ type: z.literal("add_mission"), summary, payload: AddMission }),
  z.strictObject({ type: z.literal("suggest_template_change"), summary, payload: TemplateChange }),
  z.strictObject({ type: z.literal("save_memory"), summary, payload: SaveMemory }),
  z.strictObject({ type: z.literal("start_mock"), summary, payload: StartMock }),
  z.strictObject({ type: z.literal("queue_ladder"), summary, payload: QueueLadder }),
  z.strictObject({ type: z.literal("end_mock"), summary, payload: EndMock }),
]);

export type Proposal = z.infer<typeof ProposalSchema>;
export type ProposalStatus = "confirmed" | "dismissed";
export type TemplateChangeRow = z.infer<typeof TemplateChange>["changes"][number];

const ProposalOutput = z.object({ proposal: ProposalSchema, status: z.enum(["confirmed", "dismissed"]).optional() });

/** A tool output that carries a valid proposal, with the user's decision if there was one. */
export function parseProposal(output: unknown): { proposal: Proposal; status?: ProposalStatus } | null {
  const parsed = ProposalOutput.safeParse(output);
  return parsed.success ? parsed.data : null;
}

type Change = { weekday: number; slot: SlotType; to: number };

/** The changes that actually differ from the current plan, with where each starts from. */
export function templateDiff(current: Templates, changes: Change[]): TemplateChangeRow[] {
  const last = new Map<string, Change>();
  for (const c of changes) last.set(`${c.weekday}:${c.slot}`, c);
  return [...last.values()]
    .map((c) => ({ weekday: c.weekday, slot: c.slot, from: current[c.weekday as Weekday]?.[c.slot] ?? 0, to: c.to }))
    .filter((c) => c.from !== c.to)
    .toSorted((a, b) => a.weekday - b.weekday || SLOT_TYPES.indexOf(a.slot) - SLOT_TYPES.indexOf(b.slot));
}

/** The plan with the changes applied, or why it can't be. The input isn't modified. */
export function applyTemplateChanges(current: Templates, changes: Change[]): { templates: Templates } | { error: string } {
  const next = structuredClone(current);
  for (const c of changes) {
    const day = next[c.weekday as Weekday];
    if (!day) return { error: "That day isn't in the plan." };
    day[c.slot] = c.to;
  }
  const parsed = parseTemplates(next);
  if (parsed.success) return { templates: parsed.data };
  return {
    error: parsed.error.issues.some((i) => i.code === "custom")
      ? "Each day needs a problem, review or topic."
      : `Each slot takes 0 to ${MAX_PER_SLOT}.`,
  };
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const SLOT_NAMES: Record<SlotType, string> = { new_problem: "New problems", review: "Reviews", topic: "Topics", cards: "Card sets" };

export function changeLine(c: TemplateChangeRow): string {
  return `${DAY_NAMES[c.weekday] ?? "?"} · ${SLOT_NAMES[c.slot]} ${c.from} → ${c.to}`;
}
