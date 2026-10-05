// Account deletion: what the person must type, and which Redis keys hold their state.
import { key } from "@/lib/upstash/keys";

export const CONFIRM_WORD = "DELETE";

/** Typed exactly, ignoring case and stray spaces, so a slip of the shift key is not a refusal. */
export function confirmsDeletion(typed: unknown): boolean {
  return typeof typed === "string" && typed.trim().toUpperCase() === CONFIRM_WORD;
}

/** The per-person Redis keys with a fixed name. Redis is shared with another app, so keys are
 *  deleted by name and never scanned for. Keys that carry a day or a client id (answers already
 *  sent, daily spend and limit counters) hold no personal text and expire by themselves.
 *  The names mirror lib/feed/service.ts, lib/coach/rate-limit.ts and app/actions/sync.ts. */
export function accountRedisKeys(userId: string): string[] {
  return [
    key("feed", userId),
    key("feed", userId, "current"),
    key("feed", userId, "advance"),
    key("diag", userId),
    key("coach", "rl", userId),
    key("lcsync", userId),
    key("rl", "report", userId),
  ];
}
