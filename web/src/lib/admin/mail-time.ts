import type { InboundEmail } from "./mail";

// Resend stamps mail as `2024-02-22T23:41:11.894719+00:00` (offset, microseconds)
// while `markMailSeen` stores `toISOString()` (`Z`, milliseconds). Compared as
// strings those disagree with the calendar, so an unread message could look read.
// Everything here compares instants.

/** Epoch ms, or null when the value is empty or not a date. */
export function instant(value: string): number | null {
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : t;
}

/** A message with no readable date counts as unread: overstating beats hiding. */
export function isUnread(createdAt: string, seenAt: string | null): boolean {
  if (!seenAt) return true;
  const seen = instant(seenAt);
  const at = instant(createdAt);
  if (seen === null || at === null) return true;
  return at > seen;
}

export function unreadOf(emails: InboundEmail[], seenAt: string | null): number {
  return emails.filter((e) => isUnread(e.createdAt, seenAt)).length;
}

/** Newest first; messages with no readable date sink to the end. */
export function newestFirst(a: { createdAt: string }, b: { createdAt: string }): number {
  return (instant(b.createdAt) ?? -Infinity) - (instant(a.createdAt) ?? -Infinity) || 0;
}

/** `2024-02-22 23:41 UTC`, or "unknown" rather than a RangeError on a bad date. */
export function formatUtc(createdAt: string): string {
  const t = instant(createdAt);
  return t === null ? "unknown" : `${new Date(t).toISOString().replace("T", " ").slice(0, 16)} UTC`;
}
