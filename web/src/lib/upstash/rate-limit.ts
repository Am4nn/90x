import "server-only";
import { createHash } from "node:crypto";
import { rateCheck } from "@/lib/coach/chat-rules";
import { logError } from "@/lib/log";
import { key } from "@/lib/upstash/keys";
import { redis } from "@/lib/upstash/redis";
import { DAILY_LIMITS, FEED_LIMIT, feedWindow, SLOT_LIMITS, type SlotKind } from "./ratelimit";

/**
 * Takes one slot from a paid action's per-user allowance. The coach chat has
 * its own limiter (lib/coach/rate-limit.ts); this covers solution review, mock
 * scoring and grading, which had no ceiling and so let one account burn the
 * shared monthly budget.
 *
 * It uses the same sliding window as the chat limiter (rateCheck over a Redis
 * GET/SET string) rather than a Lua-based rate-limit library, so it works
 * against the same Redis the rest of the app uses, including the e2e stack.
 * It fails closed, like the chat limiter: when the meter is down, a paid
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
    logError(`rate limit unavailable for ${kind}`, e);
    // Fail closed: a paid action must not run when we cannot meter it.
    return { allowed: false, retryAfterSec: 0 };
  }
}

/**
 * Counts one Feed action (a card fetched or an answer sent) against the person's hourly
 * allowance. One Redis command per action. Unlike the paid actions this fails open: the Feed
 * costs nothing to serve, so a Redis blip must not lock readers out of their cards.
 */
export async function takeFeedSlot(userId: string, now = Date.now()): Promise<boolean> {
  const k = key("rl", "feed", userId, String(feedWindow(now)));
  try {
    const used = await redis().incr(k);
    if (used === 1) await redis().expire(k, FEED_LIMIT.windowSeconds * 2);
    return used <= FEED_LIMIT.limit;
  } catch (e) {
    logError("feed rate limit unavailable", e);
    return true;
  }
}

/**
 * Takes one of an address's hourly allowance of anonymous /try events (SLOT_LIMITS.tryEvent), in a fixed window.
 * The route is public, so this uses an atomic INCR rather than takeSlot's GET/SET: a burst of parallel posts cannot
 * all read the same count and slip under the cap. The key is a SHA-256 of the address (an IPv6 address by its /64,
 * which one household or phone rotates within), so no address is ever written to Redis. Fails closed: with Redis
 * down, events are dropped.
 */
export async function takeTryEventSlot(ip: string, now = Date.now()): Promise<boolean> {
  const { limit, windowMs } = SLOT_LIMITS.tryEvent;
  const k = key("try", createHash("sha256").update(addressGroup(ip)).digest("hex"), String(Math.floor(now / windowMs)));
  try {
    const used = await redis().incr(k);
    if (used === 1) await redis().expire(k, windowMs / 1000);
    return used <= limit;
  } catch (e) {
    logError("try event rate limit unavailable", e);
    return false;
  }
}

/** The address an allowance belongs to: IPv4 as is, IPv6 by its first four hextets (its /64), normalised. */
function addressGroup(ip: string): string {
  const addr = ip.trim().toLowerCase().replace(/%.*$/, "");
  // IPv4 as is, and an IPv4-mapped IPv6 (::ffff:1.2.3.4) as its IPv4, or every such client would share one /64.
  if (addr.includes(".")) return addr.slice(addr.lastIndexOf(":") + 1);
  if (!addr.includes(":")) return addr;
  const [head = "", tail] = addr.split("::", 2);
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const groups = tail === undefined ? left : [...left, ...Array<string>(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right];
  return groups
    .slice(0, 4)
    .map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? Number.parseInt(g, 16).toString(16) : g))
    .join(":");
}

/**
 * Takes one of a person's daily allowance for a counter that must not be inflated (DAILY_LIMITS), per UTC day.
 * INCR is atomic, so parallel calls cannot all read the same count and slip under the cap, unlike the
 * GET/SET window above. Fails closed: with Redis down, nothing is counted.
 */
export async function takeDailyCount(userId: string, kind: keyof typeof DAILY_LIMITS, now = Date.now()): Promise<boolean> {
  const k = key("rl", kind, userId, new Date(now).toISOString().slice(0, 10));
  try {
    const used = await redis().incr(k);
    if (used === 1) await redis().expire(k, 2 * 86_400);
    return used <= DAILY_LIMITS[kind];
  } catch (e) {
    logError(`daily count unavailable for ${kind}`, e);
    return false;
  }
}
