import "server-only";
import { logError } from "@/lib/log";
import { key } from "@/lib/upstash/keys";
import { redis } from "@/lib/upstash/redis";
import { RATE_LIMIT, rateCheck } from "./chat-rules";

/** How long a refused message waits when the meter itself is down: the chat shows its usual "try again in a minute". */
export const METER_DOWN_RETRY_SEC = 60;

/**
 * Takes one message from the user's coach allowance (30 per 10 minutes).
 * Fails closed, like the paid-action limiter: when Redis is down the message is refused
 * (429, "try again in a minute") rather than sent unmetered. The AI budget is small enough
 * that cost safety beats a coach that answers through an outage.
 */
export async function takeMessageSlot(userId: string, now = Date.now()): Promise<{ allowed: boolean; retryAfterSec: number }> {
  const k = key("coach", "rl", userId);
  try {
    const stored = await redis().get<unknown>(k);
    const check = rateCheck(Array.isArray(stored) ? stored : [], now);
    if (check.allowed) await redis().set(k, JSON.stringify(check.stamps), { ex: Math.ceil(RATE_LIMIT.windowMs / 1000) });
    return check;
  } catch (e) {
    logError("coach rate limit unavailable", e);
    return { allowed: false, retryAfterSec: METER_DOWN_RETRY_SEC };
  }
}
