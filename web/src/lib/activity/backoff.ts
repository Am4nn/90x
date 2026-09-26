export const FAILURES_BEFORE_BACKOFF = 3;
const BACKOFF_MS = 24 * 60 * 60 * 1000;

/** Pure decision: sync now, or wait (disabled, or backing off after failures). */
export function shouldSync(
  s: { enabled: boolean; consecutiveFailures: number; lastAttemptAt: Date | null },
  now: Date = new Date(),
): boolean {
  if (!s.enabled) return false;
  if (s.consecutiveFailures < FAILURES_BEFORE_BACKOFF || !s.lastAttemptAt) return true;
  return now.getTime() - s.lastAttemptAt.getTime() >= BACKOFF_MS;
}
