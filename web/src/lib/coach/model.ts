import "server-only";
import type { LanguageModel, LanguageModelUsage } from "ai";
import { fastModel, smartModel } from "@/lib/ai";
import { budget, recordUsage } from "@/lib/ai/usage";

// Which model the coach uses right now: DeepSeek Pro,
// falling back to Flash once the month's group budget is spent. Grading never
// comes through here; it always uses the fast model.

export async function coachModel(): Promise<{ model: LanguageModel; degraded: boolean }> {
  const { state } = await budget();
  return state === "over" ? { model: fastModel(), degraded: true } : { model: smartModel(), degraded: false };
}

export function modelName(model: LanguageModel): string {
  return typeof model === "string" ? model : model.modelId;
}

/** Log one coach call's tokens against the user and the monthly meter. @public (used by the coach) */
export async function trackCoachUsage(userId: string, route: string, model: LanguageModel, usage: LanguageModelUsage) {
  await recordUsage({ userId, route, model: modelName(model), tokensIn: usage.inputTokens ?? 0, tokensOut: usage.outputTokens ?? 0 });
}
