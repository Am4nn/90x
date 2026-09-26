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

export type BudgetState = "ok" | "warn" | "over";

export function budgetState(spentUsd: number, budgetUsd: number): BudgetState {
  if (spentUsd >= budgetUsd) return "over";
  if (spentUsd >= budgetUsd * 0.8) return "warn";
  return "ok";
}
