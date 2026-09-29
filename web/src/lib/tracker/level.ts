/** How much interview practice someone had before 90x: asked on Set up, shown
 *  on Plan, changeable any time.
 *
 *  The stored column is nullable and null means nobody asked. Every account
 *  that predates the column is null, and every rule that reads a level reads
 *  null as "behave exactly as the app behaved before levels existed". That is
 *  the property that makes adding a level safe, and the first thing both
 *  `level.test.ts` and `template.test.ts` pin. */

export const LEVELS = [
  { value: "first_time", label: "First time", hint: "New to DSA interviews" },
  { value: "some_practice", label: "Some practice", hint: "Comfortable with the basics" },
  { value: "ready", label: "Interview-ready", hint: "Mostly hard problems now" },
] as const;

export type Level = (typeof LEVELS)[number]["value"];

/** The three values as a tuple, for the Zod enums. Here rather than typed out
 *  again in `lib/setup.ts` and `app/actions/plan.ts`, so the chips, the setup
 *  schema and the action schema cannot drift apart. */
export const LEVEL_VALUES = LEVELS.map((level) => level.value) as [Level, ...Level[]];

/** Narrow a stored or posted value to a level. Null, an empty string and a
 *  value this build does not know all read as "never asked": the pre-level
 *  rules, so a database ahead of this deploy cannot plan badly. */
export function asLevel(value: string | null | undefined): Level | null {
  const found = LEVELS.find((level) => level.value === value);
  return found ? found.value : null;
}

/** About one grade of importance. A level biases which new problem comes next
 *  by this much, which is enough for a first-timer to get an Easy problem over
 *  a Medium one, and small enough that a much more important problem still
 *  wins. */
const DIFFICULTY_WEIGHT = 0.2;

/** How much a level likes a problem, added to its importance score. Exactly
 *  zero for `some_practice` and for no level, so an account nobody asked about
 *  keeps today's importance-only order, tie for tie. */
export function difficultyScore(level: Level | null | undefined, difficulty: string): number {
  if (level !== "first_time" && level !== "ready") return 0;
  // An unknown difficulty reads as Medium rather than being skipped.
  const grade = difficulty === "Easy" ? 0 : difficulty === "Hard" ? 2 : 1;
  return DIFFICULTY_WEIGHT * (level === "first_time" ? 1 - grade / 2 : grade / 2);
}
