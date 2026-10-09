// Account deletion: what the person must type, and which Redis keys hold their state.
import { key } from "@/lib/upstash/keys";

export const CONFIRM_WORD = "DELETE";

/** Typed exactly, ignoring case and stray spaces, so a slip of the shift key is not a refusal. */
export function confirmsDeletion(typed: unknown): boolean {
  return typeof typed === "string" && typed.trim().toUpperCase() === CONFIRM_WORD;
}

/** An admin's delete confirm: the account's own email, typed in any case with stray spaces.
 *  An account with no email can't be confirmed this way, so it is never a match. */
export function confirmsEmail(typed: unknown, email: string | null): boolean {
  const want = email?.trim().toLowerCase();
  return typeof typed === "string" && !!want && typed.trim().toLowerCase() === want;
}

/** The per-person Redis keys with a fixed name. Redis is shared with another app, so keys are
 *  deleted by name and never scanned for. Keys that carry a day or a client id (answers already
 *  sent, daily spend and limit counters) hold no personal text and expire by themselves.
 *  The names mirror lib/feed/service.ts, lib/coach/rate-limit.ts and app/actions/sync.ts. */
export function accountRedisKeys(userId: string): string[] {
  return [
    key("feedq", userId),
    // The queue's old name; such queues expire within a week of 2026-10-05.
    key("feed", userId),
    key("feed", userId, "current"),
    key("feed", userId, "advance"),
    key("diag", userId),
    key("coach", "rl", userId),
    key("lcsync", userId),
    key("rl", "report", userId),
  ];
}
