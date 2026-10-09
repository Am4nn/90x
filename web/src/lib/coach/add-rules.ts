import { z } from "zod";

// Pure rules for "Add with Coach": the model's answer, the prompt, the chips.

export const AddAnswer = z.object({
  say: z.string().min(1).max(300),
  picks: z.array(z.object({ kind: z.enum(["problem", "topic"]), ref: z.string().min(1).max(200), why: z.string().min(1).max(120) })).max(3),
});
export type AddAnswer = z.infer<typeof AddAnswer>;
export type AddPick = AddAnswer["picks"][number];

// What the model must satisfy. The provider's json_object mode does not enforce lengths, so a long `why` would
// fail the whole turn after it was paid for: the model schema has no caps and `clampAnswer` applies the stored
// ones (AddAnswer above, AddExtras in proposals.ts) afterwards.
export const AddModelAnswer = z.object({
  say: z.string().min(1),
  picks: z.array(z.object({ kind: z.enum(["problem", "topic"]), ref: z.string().min(1), why: z.string().min(1) })),
});

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** The model's answer cut to the stored limits: prose trimmed to size, picks de-duplicated and capped at 3. */
export function clampAnswer(a: z.infer<typeof AddModelAnswer>): AddAnswer {
  return {
    say: cut(a.say.trim(), 300) || "Here you go.",
    picks: uniquePicks(a.picks.map((p) => ({ kind: p.kind, ref: p.ref.slice(0, 200), why: cut(p.why.trim(), 120) || "A good next one." }))),
  };
}

/** What Coach says, plus a plain note when the server dropped picks (already on the list, solved, or not found), so the text never promises an item that isn't shown. */
export function withLeftOut(say: string, picked: number, kept: number): string {
  const dropped = picked - kept;
  if (dropped <= 0) return say;
  if (kept === 0) return `${say} None of those can be added: they're already on your list or done. Try asking for something else.`;
  return `${say} I left out ${dropped === 1 ? "one that's" : `${dropped} that are`} already on your list or done.`;
}

export const ADD_SYSTEM = `You pick what to add to someone's Extras: 1 to 3 interview-prep items they asked for.
- Items are LeetCode problems (kind "problem", ref = the problem slug) or study topics outside DSA (kind "topic", ref = the topic slug).
- Look items up with find_problems and find_topics. Use only slugs those tools returned. Never invent one.
- Only unsolved problems and unstudied topics. Respect what they asked for (pattern, difficulty, company, size, area).
- Never pick anything already in today's missions or open extras (listed below); pick the next one instead.
- When the request is vague, prefer their weakest patterns.
- "say" is one or two short sentences in plain words: why these. If nothing fits, say so and offer the nearest thing.
- "why" is one short line per item (under 100 characters). Keep "say" under 250 characters.
- If they push back ("easier", "not topo sort"), change the picks to match and say what you changed.`;

export type AddContext = {
  memory: string;
  level: string | null;
  today: { title: string; kind: string }[];
  extras: { title: string }[];
  weakPatterns: string[];
  companies: string[];
  addedToday: string[];
};

const list = (xs: string[]) => (xs.length ? xs.join(", ") : "none");

export function addContextBlock(c: AddContext): string {
  return [
    `Level: ${c.level ?? "unknown"}`,
    `Today's missions: ${list(c.today.map((m) => `${m.title} (${m.kind})`))}`,
    `Open extras: ${list(c.extras.map((x) => x.title))}`,
    `Weakest patterns: ${list(c.weakPatterns)}`,
    `Company focus: ${list(c.companies)}`,
    `Already added from this box today: ${list(c.addedToday)}`,
    c.memory ? `What you know about them:\n${c.memory}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export const lastMessages = <T>(messages: T[], n = 6): T[] => messages.slice(-n);

export function chipsFor(input: {
  lastSolved: { title: string } | null;
  weakestPattern: string | null;
  companies: string[];
  plannedMinutesLeft: number;
  localHour: number;
}): string[] {
  const chips: string[] = [];
  if (input.lastSolved) chips.push(`Harder than ${input.lastSolved.title}`);
  if (input.weakestPattern) chips.push(`More ${input.weakestPattern.toLowerCase()}`);
  if (input.companies[0]) chips.push(`Asked at ${input.companies[0]}`);
  if (input.plannedMinutesLeft <= 20 || input.localHour >= 20) chips.push("A quick 15-min one");
  return chips.slice(0, 4);
}

export const addReason = (meta: string) => `${meta.split(" · ")[0] || "Extra"} · Added with Coach`;

export function uniquePicks(picks: AddPick[]): AddPick[] {
  const seen = new Set<string>();
  return picks.filter((p) => !seen.has(`${p.kind}:${p.ref}`) && seen.add(`${p.kind}:${p.ref}`)).slice(0, 3);
}
