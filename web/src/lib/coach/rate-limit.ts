import "server-only";
import { key } from "@/lib/upstash/keys";
import { redis } from "@/lib/upstash/redis";
import { RATE_LIMIT, rateCheck } from "./chat-rules";

/**
 * Takes one message from the user's coach allowance (30 per 10 minutes).
 * When Redis is down the message goes through: the monthly budget still caps
 * spend, and a Redis blip shouldn't silence the coach.
 */
export async function takeMessageSlot(userId: string, now = Date.now()): Promise<{ allowed: boolean; retryAfterSec: number }> {
  const k = key("coach", "rl", userId);
  try {
    const stored = await redis().get<unknown>(k);
    const check = rateCheck(Array.isArray(stored) ? stored : [], now);
    if (check.allowed) await redis().set(k, JSON.stringify(check.stamps), { ex: Math.ceil(RATE_LIMIT.windowMs / 1000) });
    return check;
  } catch (e) {
    console.error("coach rate limit unavailable", e);
    return { allowed: true, retryAfterSec: 0 };
  }
}
