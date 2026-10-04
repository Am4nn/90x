import "server-only";
import type { LanguageModel, LanguageModelUsage } from "ai";
import { fastModel, smartModel } from "@/lib/ai";
import { billedTokens } from "@/lib/ai/cost";
import { aiGate } from "@/lib/ai/guard";
import { recordUsage } from "@/lib/ai/usage";

// Which model the coach uses right now: DeepSeek Pro,
// falling back to Flash once the month's group budget is spent. Grading never
// comes through here; it always uses the fast model.

/** True once today's or this month's cap is reached: the coach runs on the fast model until it resets. */
export async function coachDegraded(): Promise<boolean> {
  const gate = await aiGate();
  return !gate.allowed || gate.degrade;
}

export async function coachModel(): Promise<{ model: LanguageModel; degraded: boolean }> {
  return (await coachDegraded()) ? { model: fastModel(), degraded: true } : { model: smartModel(), degraded: false };
}

export function modelName(model: LanguageModel): string {
  return typeof model === "string" ? model : model.modelId;
}

/** Log one coach call's billed tokens (every step, hidden thinking included) against the user and the monthly meter. @public (used by the coach) */
export async function trackCoachUsage(
  userId: string,
  route: string,
  model: LanguageModel,
  call: { steps: readonly { usage: LanguageModelUsage }[] },
) {
  await recordUsage({ userId, route, model: modelName(model), ...billedTokens(call.steps) });
}
