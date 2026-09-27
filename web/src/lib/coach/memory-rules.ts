// Coach memory: lasting facts about one user, merged after each
// thread, solution review and mock. Pure rules; lib/coach/memory.ts does I/O.

export const MEMORY_KINDS = ["habit", "strength", "goal", "preference", "context"] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];
export type MemoryStatus = "active" | "improving" | "resolved";
export type Evidence = { kind: string; id: string };

export type Fact = {
  id: string;
  kind: MemoryKind;
  text: string;
  status: MemoryStatus;
  evidence: Evidence[];
  updatedAt: string;
};

/** What the extraction model returns: new facts, and ids of known facts seen again. */
export type Extracted = { facts: { kind: MemoryKind; text: string }[]; seen: string[] };

const same = (a: string) =>
  a
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

export function planMerge(existing: Fact[], extracted: Extracted, evidence: Evidence) {
  const known = new Set(existing.map((f) => same(f.text)));
  const insert: { kind: MemoryKind; text: string; evidence: Evidence[] }[] = [];
  for (const f of extracted.facts) {
    const key = same(f.text);
    if (!key || known.has(key)) continue;
    known.add(key);
    insert.push({ kind: f.kind, text: f.text.trim(), evidence: [evidence] });
  }
  const byId = new Map(existing.map((f) => [f.id, f]));
  const update = [...new Set(extracted.seen)]
    .map((id) => byId.get(id))
    .filter((f): f is Fact => Boolean(f))
    .map((f) => ({ id: f.id, status: "active" as const, evidence: [...f.evidence, evidence] }));
  return { insert, update };
}

const DAY = 86_400_000;
const IMPROVING_AFTER_DAYS = 14;
const RESOLVED_AFTER_DAYS = 28;

/** A habit that stops showing up improves after 14 quiet days and resolves after 28. Other kinds don't age. */
export function ageFacts(facts: Fact[], now: Date): { id: string; status: MemoryStatus }[] {
  const out: { id: string; status: MemoryStatus }[] = [];
  for (const f of facts) {
    if (f.kind !== "habit" || f.status === "resolved") continue;
    const quiet = (now.getTime() - new Date(f.updatedAt).getTime()) / DAY;
    if (quiet >= RESOLVED_AFTER_DAYS) out.push({ id: f.id, status: "resolved" });
    else if (quiet >= IMPROVING_AFTER_DAYS && f.status === "active") out.push({ id: f.id, status: "improving" });
  }
  return out;
}

const HEADINGS: Record<MemoryKind, string> = {
  habit: "Habits",
  strength: "Strengths",
  goal: "Goals",
  preference: "Preferences",
  context: "Context",
};

/** The memory section every coach prompt starts with. */
export function memoryBlock(facts: Fact[]): string {
  const live = facts.filter((f) => f.status !== "resolved");
  if (!live.length) return "Nothing known about this user yet.";
  return MEMORY_KINDS.map((kind) => {
    const items = live.filter((f) => f.kind === kind);
    if (!items.length) return null;
    return `${HEADINGS[kind]}:\n${items.map((f) => `- ${f.text}${f.status === "improving" ? " (improving)" : ""} [${f.id}]`).join("\n")}`;
  })
    .filter(Boolean)
    .join("\n\n");
}
