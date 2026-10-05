// Per-user ceilings on the paid AI actions. Pure config, kept separate from the
// Redis wrapper (rate-limit.ts) so it is unit-testable, the same way
// chat-rules.ts sits beside coach/rate-limit.ts. The window itself is the same
// sliding window `rateCheck` implements for coach chat: it needs only Redis
// GET/SET, so it works against the same Redis the rest of the app uses.

export type SlotKind = "review" | "mock" | "grade" | "report";

export const SLOT_LIMITS = {
  // A solution review is the expensive model; ten an hour is generous.
  review: { limit: 10, windowMs: 3_600_000 },
  // Mocks are one-at-a-time with a scoring lock, so twenty an hour is a floor.
  mock: { limit: 20, windowMs: 3_600_000 },
  // Grading is the fast model, but a wrong-answer flood still spends.
  grade: { limit: 120, windowMs: 3_600_000 },
  // Not paid, but each report emails the owner, so one account must not be able to flood the inbox.
  report: { limit: 5, windowMs: 3_600_000 },
} as const satisfies Record<SlotKind, { limit: number; windowMs: number }>;

// Feed reads and answers. A fixed window per person: a real reader does a few dozen an
// hour (the most seen in production is 19 answers), so this sits far above any reader and
// well below a script looping through the Feed to collect every card's answer.
export const FEED_LIMIT = { limit: 300, windowSeconds: 3600 } as const;

/** Which fixed window a moment falls in. */
export function feedWindow(now: number): number {
  return Math.floor(now / (FEED_LIMIT.windowSeconds * 1000));
}
