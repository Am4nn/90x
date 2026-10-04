import "server-only";
import { getSettings } from "@/lib/settings";
import { decide, type Verdict } from "./guard-rules";
import { readSpend } from "./usage";

// The one question every AI entry point asks before it spends: may this person's call run?
// Cards, Today, the Library and the Tracker never call AI, so a stop here leaves them working.

export type AiGate = Verdict;

/** What to tell a person when AI is stopped for everyone (paused, or past a spend line). */
const AI_RESTING = "AI is resting for now. Everything else still works. Try again a little later.";

/** What to tell a person who has used their own daily allowance. Never says how much the allowance is. */
const ALLOWANCE_USED = "You've used today's AI allowance. It resets tomorrow. Cards, Today and the Library still work.";

/** The sentence for a refused call. The amounts behind these limits are server-side and for admins only. */
export function refusal(gate: Extract<AiGate, { allowed: false }>): string {
  return gate.reason === "user-cap" ? ALLOWANCE_USED : AI_RESTING;
}

/** Whether an AI call may run, for this person when given. A failure to read the meters lets it through, and logs. */
export async function aiGate(userId?: string | null): Promise<AiGate> {
  const settings = await getSettings();
  // Paused needs no meters, so a stop switch still works when Redis and the database struggle.
  if (settings.aiPaused) return { allowed: false, reason: "paused" };
  return decide(settings, await readSpend(userId));
}
