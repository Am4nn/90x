import type { LanguageModelUsage } from "ai";

// What AI calls cost, and where the month stands against the group budget
// (warn at 80%; at 100% coach and mocks degrade, grading continues).

const PRICES: Record<string, [input: number, output: number]> = {
  // USD per million tokens.
  "deepseek-flash": [0.3, 1.2],
  "deepseek-v4-pro": [1.32, 3.96],
  "gemini-3.8-flash": [0.75, 3.75],
};
const UNKNOWN: [number, number] = [1, 5];

export function costUsd(model: string, tokensIn: number, tokensOut: number): number {
  const [pin, pout] = PRICES[model] ?? UNKNOWN;
  return (tokensIn * pin + tokensOut * pout) / 1_000_000;
}

const count = (v: unknown) => (typeof v === "number" && v > 0 ? v : 0);

/**
 * Tokens to bill for one AI call, summed over its steps. DeepSeek can leave
 * thinking out of completion_tokens but still bill it, and the AI SDK only maps
 * completion_tokens, so whatever the raw total_tokens has beyond prompt +
 * completion is added to the output.
 */
export function billedTokens(steps: readonly { usage: LanguageModelUsage }[]): { tokensIn: number; tokensOut: number } {
  let tokensIn = 0;
  let tokensOut = 0;
  for (const { usage } of steps) {
    tokensIn += usage.inputTokens ?? 0;
    tokensOut += usage.outputTokens ?? 0;
    const raw = usage.raw ?? {};
    if (typeof raw.total_tokens === "number") {
      tokensOut += count(raw.total_tokens - count(raw.prompt_tokens) - count(raw.completion_tokens));
    }
  }
  return { tokensIn, tokensOut };
}

export type BudgetState = "ok" | "warn" | "over";

export function budgetState(spentUsd: number, budgetUsd: number): BudgetState {
  if (spentUsd >= budgetUsd) return "over";
  if (spentUsd >= budgetUsd * 0.8) return "warn";
  return "ok";
}
