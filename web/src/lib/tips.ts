// The first-visit demo: tips that point at real
// controls, after the welcome, each step shown once per account. A new feature adds
// a step at the end; ids are stored (profiles.tips_seen), so never reuse one.

export type TipId = "plan-me" | "audio";
/** `data-tip` names on real controls (Today's plan link, the nav items). */
export type Anchor = "plan" | "me" | "library";

export type TipStep = { id: TipId; anchors: readonly Anchor[] };

export const AUDIO_LESSON = "/library/topic/ai-generative-ai-llms";
export const DEMO_CAP = 4;

export const DEMO: readonly TipStep[] = [
  { id: "plan-me", anchors: ["plan", "me"] },
  { id: "audio", anchors: ["library"] },
];

/** Every step id: what an account that has done the demo has seen, and Today's fallback when it can't read. */
export const ALL_SEEN: readonly string[] = DEMO.map((s) => s.id);
export const TIP_IDS: ReadonlySet<string> = new Set(ALL_SEEN);

/** The steps this account still has, in order, at most DEMO_CAP. */
export function demoSteps(seen: readonly string[]): TipStep[] {
  return DEMO.filter((s) => !seen.includes(s.id)).slice(0, DEMO_CAP);
}
