import "server-only";
import { db } from "@/db";
import { aiUsage } from "@/db/schema";
import { key } from "@/lib/upstash/keys";
import { redis } from "@/lib/upstash/redis";
import { type BudgetState, budgetState, costUsd } from "./cost";

// Every AI call from the app is logged to ai_usage and added to a Redis meter
// for the month, so the budget check is one read instead of a table scan.

const monthKey = (now = new Date()) => key("ai", "spend", now.toISOString().slice(0, 7));
const MONTH_SECONDS = 40 * 24 * 60 * 60;

function monthlyBudget(): number {
  return Number(process.env.AI_MONTHLY_BUDGET_USD) || 10;
}

export async function recordUsage(entry: { userId: string | null; route: string; model: string; tokensIn: number; tokensOut: number }) {
  const cost = costUsd(entry.model, entry.tokensIn, entry.tokensOut);
  try {
    await db.insert(aiUsage).values({ ...entry, costUsd: cost });
    const k = monthKey();
    await redis().incrbyfloat(k, cost);
    await redis().expire(k, MONTH_SECONDS);
  } catch (e) {
    // A logging failure must never fail the answer being graded.
    console.error("ai usage not recorded", e);
  }
  return cost;
}

/** @public Read by the coach to fall back to the fast model when over budget. */
export async function budget(): Promise<{ spent: number; limit: number; state: BudgetState }> {
  const limit = monthlyBudget();
  let spent = 0;
  try {
    spent = Number(await redis().get<number>(monthKey())) || 0;
  } catch (e) {
    console.error("ai budget unreadable", e);
  }
  return { spent, limit, state: budgetState(spent, limit) };
}
