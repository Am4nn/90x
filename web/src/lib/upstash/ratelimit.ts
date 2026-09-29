// Per-user ceilings on the paid AI actions. Pure config, kept separate from the
// Redis wrapper (rate-limit.ts) so it is unit-testable, the same way
// chat-rules.ts sits beside coach/rate-limit.ts. The window itself is the same
// sliding window `rateCheck` implements for coach chat: it needs only Redis
// GET/SET, so it works against the same Redis the rest of the app uses.

export type SlotKind = "review" | "mock" | "grade";

export const SLOT_LIMITS = {
  // A solution review is the expensive model; ten an hour is generous.
  review: { limit: 10, windowMs: 3_600_000 },
  // Mocks are one-at-a-time with a scoring lock, so twenty an hour is a floor.
  mock: { limit: 20, windowMs: 3_600_000 },
  // Grading is the fast model, but a wrong-answer flood still spends.
  grade: { limit: 120, windowMs: 3_600_000 },
} as const satisfies Record<SlotKind, { limit: number; windowMs: number }>;
