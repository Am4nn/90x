// The reader's difficulty mix: what share of the next queue should be Easy,
// Medium and Hard. Pure, so the mapping is testable without a database and
// FSRS scheduling stays untouched — this only chooses which cards enter the
// queue, never their intervals.

export const DIFFICULTIES = ["Easy", "Medium", "Hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const DIFFICULTY_PREFERENCES = ["harder", "standard", "easier"] as const;
export type DifficultyPreference = (typeof DIFFICULTY_PREFERENCES)[number];

const LEVELS = ["first_time", "some_practice", "ready"] as const;
export type Level = (typeof LEVELS)[number];

/** Shares of Easy/Medium/Hard the next queue should aim for; they sum to 1. */
export type DifficultyMix = { easy: number; medium: number; hard: number };

// The mix trades Easy for Hard around a fixed Medium. The floor matters: no
// share ever reaches zero, so the reader's toggle and the accuracy response
// change probabilities, never membership — a deprioritised card stays reachable.
const EASY_TOP = 0.5;
const HARD_FLOOR = 0.15;
const MEDIUM_SHARE = 1 - EASY_TOP - HARD_FLOOR; // 0.35
const SWING = EASY_TOP - HARD_FLOOR; // 0.35
/** How far a preference moves the underlying hardness (out of 1). */
const PREFERENCE_SHIFT = 0.2;

/** Hardness (0 = easiest, 1 = hardest) from the self-declared level, used until
 *  there are graded answers to calibrate from. */
function levelHardness(level: Level | null): number {
  switch (level) {
    case "first_time":
      return 0;
    case "some_practice":
      return 0.5;
    case "ready":
      return 1;
    default:
      return 0.5;
  }
}

/** Hardness from rolling accuracy (a fraction in [0, 1]): 50% correct is the
 *  easiest mix, 100% the hardest, 75% — the target — sits in the middle. */
function accuracyHardness(accuracy: number): number {
  const clamped = Math.min(1, Math.max(0, accuracy));
  return Math.min(1, Math.max(0, 2 * clamped - 1));
}

export function difficultyMix(rollingAccuracy: number | null, level: Level | null, preference: DifficultyPreference): DifficultyMix {
  const base = rollingAccuracy === null ? levelHardness(level) : accuracyHardness(rollingAccuracy);
  const shift = preference === "harder" ? PREFERENCE_SHIFT : preference === "easier" ? -PREFERENCE_SHIFT : 0;
  const hardness = Math.min(1, Math.max(0, base + shift));
  const easy = EASY_TOP - SWING * hardness;
  const hard = HARD_FLOOR + SWING * hardness;
  return { easy, medium: MEDIUM_SHARE, hard };
}

/** `cards.difficulty`, validated against the three labels; null when unset. */
export function parseDifficulty(value: unknown): Difficulty | null {
  return typeof value === "string" && (DIFFICULTIES as readonly string[]).includes(value) ? (value as Difficulty) : null;
}

/** `profiles.level`, validated; null when unset or malformed. */
export function parseLevel(value: unknown): Level | null {
  return typeof value === "string" && (LEVELS as readonly string[]).includes(value) ? (value as Level) : null;
}

/** The `difficulty` key inside `profiles.feed_topics` (or a raw string),
 *  defaulting to "standard". The feed_topics jsonb also holds `.areas`, which
 *  `parseFeedAreas` reads and which this ignores. */
export function parseDifficultyPreference(value: unknown): DifficultyPreference {
  const raw = value && typeof value === "object" ? (value as { difficulty?: unknown }).difficulty : value;
  return typeof raw === "string" && (DIFFICULTY_PREFERENCES as readonly string[]).includes(raw)
    ? (raw as DifficultyPreference)
    : "standard";
}
