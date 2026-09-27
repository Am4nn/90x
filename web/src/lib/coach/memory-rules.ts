// Coach memory: lasting facts about one user, merged after each
// thread, solution review and mock. Pure rules; lib/coach/memory.ts does I/O.

export const MEMORY_KINDS = ["habit", "strength", "goal", "preference", "context"] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];
export type MemoryStatus = "active" | "improving" | "resolved";
/** Stored only: a fact the user deleted. Never listed or prompted; kept so extraction doesn't learn it again. */
export const DISMISSED = "dismissed";
export type Evidence = { kind: string; id: string };

export type Fact = {
  id: string;
  kind: MemoryKind;
  text: string;
  status: MemoryStatus;
  evidence: Evidence[];
  /** When new evidence last showed this fact; habits age from here. */
  lastSeenAt: string;
  /** The day a goal or context stops being true, if it has one (YYYY-MM-DD). */
  expiresOn: string | null;
};

/**
 * What the extraction model returns: new facts (each may replace a known fact
 * it corrects, and may carry the date it stops being true), ids of known facts
 * seen again, and ids of known facts the material shows are no longer true.
 */
export type Extracted = {
  facts: { kind: MemoryKind; text: string; replaces?: string | null; expires?: string | null }[];
  seen: string[];
  retired?: string[] | null;
};

const MAX_EVIDENCE = 20;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const validDay = (d: string | null | undefined) => (d && ISO_DAY.test(d) && !Number.isNaN(Date.parse(d)) ? d : null);

const same = (a: string) =>
  a
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/**
 * Merge one extraction into what is known. `dismissed` holds the texts of
 * facts the user deleted: those are never inserted again. A fact that is
 * replaced by a correction, or retired, resolves, so contradicting facts never
 * both reach the prompt. The model can invent ids; unknown ones are ignored.
 */
export function planMerge(existing: Fact[], extracted: Extracted, evidence: Evidence, now: Date, dismissed: string[] = []) {
  const byId = new Map(existing.map((f) => [f.id, f]));
  const known = new Set([...existing.map((f) => same(f.text)), ...dismissed.map(same)]);
  const resolve = new Set((extracted.retired ?? []).filter((id) => byId.has(id)));
  const insert: { kind: MemoryKind; text: string; evidence: Evidence[]; expiresOn: string | null }[] = [];
  for (const f of extracted.facts) {
    const key = same(f.text);
    if (!key || known.has(key)) continue;
    known.add(key);
    insert.push({ kind: f.kind, text: f.text.trim(), evidence: [evidence], expiresOn: validDay(f.expires) });
    if (f.replaces && byId.has(f.replaces)) resolve.add(f.replaces);
  }
  const seenAt = now.toISOString();
  const update: { id: string; status: MemoryStatus; evidence: Evidence[]; lastSeenAt?: string }[] = [];
  for (const id of new Set(extracted.seen)) {
    const f = byId.get(id);
    if (!f || resolve.has(id)) continue;
    update.push({ id, status: "active", evidence: [...f.evidence, evidence].slice(-MAX_EVIDENCE), lastSeenAt: seenAt });
  }
  for (const id of resolve) {
    const f = byId.get(id);
    if (f && f.status !== "resolved") update.push({ id, status: "resolved", evidence: f.evidence });
  }
  return { insert, update };
}

const DAY = 86_400_000;
const IMPROVING_AFTER_DAYS = 14;
const RESOLVED_AFTER_DAYS = 28;

/**
 * A habit that stops showing up improves after 14 quiet days and resolves after
 * 28, counted from the last evidence (not from the last status change). Any
 * fact past its expiry date resolves. Other facts without a date don't age.
 */
export function ageFacts(facts: Fact[], now: Date): { id: string; status: MemoryStatus }[] {
  const out: { id: string; status: MemoryStatus }[] = [];
  const today = now.toISOString().slice(0, 10);
  for (const f of facts) {
    if (f.status === "resolved") continue;
    if (f.expiresOn && f.expiresOn < today) {
      out.push({ id: f.id, status: "resolved" });
      continue;
    }
    if (f.kind !== "habit") continue;
    const quiet = (now.getTime() - new Date(f.lastSeenAt).getTime()) / DAY;
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
    return `${HEADINGS[kind]}:\n${items.map((f) => `- ${f.text}${f.status === "improving" ? " (improving)" : ""}${f.expiresOn ? ` (until ${f.expiresOn})` : ""} [${f.id}]`).join("\n")}`;
  })
    .filter(Boolean)
    .join("\n\n");
}
