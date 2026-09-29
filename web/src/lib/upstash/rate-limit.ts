import "server-only";
import { rateCheck } from "@/lib/coach/chat-rules";
import { key } from "@/lib/upstash/keys";
import { redis } from "@/lib/upstash/redis";
import { SLOT_LIMITS, type SlotKind } from "./ratelimit";

/**
 * Takes one slot from a paid action's per-user allowance. The coach chat has
 * its own limiter (lib/coach/rate-limit.ts); this covers solution review, mock
 * scoring and grading, which had no ceiling and so let one account burn the
 * shared monthly budget.
 *
 * It uses the same sliding window as the chat limiter (rateCheck over a Redis
 * GET/SET string) rather than a Lua-based rate-limit library, so it works
 * against the same Redis the rest of the app uses, including the e2e stack.
 * It fails closed, unlike the chat limiter: when the meter is down, a paid
 * action is refused rather than run unmetered.
 */
export async function takeSlot(userId: string, kind: SlotKind, now = Date.now()): Promise<{ allowed: boolean; retryAfterSec: number }> {
  const k = key("rl", kind, userId);
  try {
    const stored = await redis().get<unknown>(k);
    const check = rateCheck(Array.isArray(stored) ? stored : [], now, SLOT_LIMITS[kind]);
    if (check.allowed) await redis().set(k, JSON.stringify(check.stamps), { ex: Math.ceil(SLOT_LIMITS[kind].windowMs / 1000) });
    return check;
  } catch (e) {
    console.error(`rate limit unavailable for ${kind}`, e);
    // Fail closed: a paid action must not run when we cannot meter it.
    return { allowed: false, retryAfterSec: 0 };
  }
}
