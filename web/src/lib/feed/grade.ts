// Grading that needs no AI: the four answer shapes, graded by pure functions,
// and the score → outcome/FSRS rating rules every graded answer goes through.
// Typed answers left the Feed, so there is no model call at answer time and the
// same answer always gets the same mark.

export type Outcome = "correct" | "wrong" | "skipped" | "new_to_me" | "known";

/** Outcomes that say something about how well the reader knows the material.
 *
 * "new_to_me" and "known" are the reader's own declaration, not a grade:
 * they carry no evidence of performance and must stay out of accuracy,
 * weakness and session counts. */
export const isGraded = (outcome: string): boolean => outcome === "correct" || outcome === "wrong";

/** Again, Hard, Good, Easy (same numbers as ts-fsrs Rating). */
export type Rating = 1 | 2 | 3 | 4;

export const PASS_MARK = 0.7;

export const DAY_MS = 86_400_000;
/** How far back a weak spot counts. The Coach reports weakness and the Feed
 *  chooses what to ask from it, so the two must agree on the window. */
export const WEAK_WINDOW_DAYS = 30;
/** The longest answer we store. `gradeWithAi` (mocks and reviews) still uses it,
 *  and `card_reviews.answer` keeps this bound for legacy typed rows. */
export const MAX_ANSWER_CHARS = 4000;

export function outcomeOf(score: number, skipped: boolean): Outcome {
  if (skipped) return "skipped";
  return score >= PASS_MARK ? "correct" : "wrong";
}

export function scoreToRating(score: number, skipped: boolean): Rating {
  if (skipped || score < PASS_MARK) return 1;
  if (score < 0.85) return 2;
  if (score < 1) return 3;
  return 4;
}

// --- The answer contract -----------------------------------------------------

/** An ordered pair of indices, e.g. a "before" constraint or a mapping edge. */
export type Pair = [number, number];

/** The four answer shapes a Feed card can ask for. */
export type Answer =
  | { shape: "chosen"; picked: number[] }
  | { shape: "ordered"; order: number[] }
  | { shape: "mapping"; pairs: Pair[] }
  | { shape: "number"; value: number };

/** The why-step: a second chosen answer, present only on Hard cards. */
export type WhyStep = { options: string[]; correct: number };

/** A card's correct answer, one field-set per shape, plus its why-step.
 *
 * Ordered cards store the constraints they claim, not one blessed sequence, so
 * every genuinely correct order passes. Numeric stores an expected value and the
 * tolerance it is judged against. */
export type CardAnswer = { whyStep: WhyStep | null } & (
  | { shape: "chosen"; picked: number[] }
  | { shape: "ordered"; constraints: Pair[]; count: number }
  | { shape: "mapping"; pairs: Pair[] }
  | { shape: "number"; value: number; tolerance: number }
);

// --- The graders (one per shape) ---------------------------------------------

const byNumber = (a: number, b: number) => a - b;

/** A chosen set is right only as the exact set: subset, superset and empty all fail. */
export function gradeChosen(picked: number[], correct: number[]): 0 | 1 {
  if (picked.length !== correct.length) return 0;
  const given = picked.toSorted(byNumber);
  const want = correct.toSorted(byNumber);
  return given.every((item, index) => item === want[index]) ? 1 : 0;
}

/** An order is right when it is a complete permutation and satisfies every
 *  required `before` pair. Two items with no constraint between them may come in
 *  either order — a free clause order is not a wrong answer. */
export function gradeOrdered(order: number[], constraints: Pair[], count: number): 0 | 1 {
  if (order.length !== count || new Set(order).size !== count) return 0;
  if (!order.every((item) => Number.isInteger(item) && item >= 0 && item < count)) return 0;
  const position = new Map(order.map((item, index) => [item, index]));
  return constraints.every(([before, after]) => (position.get(before) ?? -1) < (position.get(after) ?? -1)) ? 1 : 0;
}

/** A mapping is right only as an exact one-to-one match: every pair must be the
 *  correct pair. One pair wrong is wrong. */
export function gradeMapping(pairs: Pair[], correct: Pair[]): 0 | 1 {
  if (pairs.length !== correct.length) return 0;
  const key = ([left, right]: Pair) => `${left}:${right}`;
  const want = new Set(correct.map(key));
  return pairs.every((pair) => want.has(key(pair))) ? 1 : 0;
}

/** A number is right when |given − expected| is within the stored tolerance. */
export function gradeNumber(value: number, expected: number, tolerance: number): 0 | 1 {
  return Math.abs(value - expected) <= tolerance ? 1 : 0;
}

/** A self-rated card has no answer shape: got is a hit, missed is a miss. */
export function gradeSelfRate(mark: "got" | "missed"): 0 | 1 {
  return mark === "got" ? 1 : 0;
}

/** Grades one answer against a card. The why-step, where present, is a second
 *  chosen answer: both halves must be right, or the card is wrong — a correct
 *  answer with the wrong reason is marked wrong. */
export function gradeCard(card: CardAnswer, answer: Answer & { why?: number }): 0 | 1 {
  let right: 0 | 1;
  switch (answer.shape) {
    case "chosen":
      right = card.shape === "chosen" ? gradeChosen(answer.picked, card.picked) : 0;
      break;
    case "ordered":
      right = card.shape === "ordered" ? gradeOrdered(answer.order, card.constraints, card.count) : 0;
      break;
    case "mapping":
      right = card.shape === "mapping" ? gradeMapping(answer.pairs, card.pairs) : 0;
      break;
    case "number":
      right = card.shape === "number" ? gradeNumber(answer.value, card.value, card.tolerance) : 0;
      break;
  }
  if (!right) return 0;
  if (card.whyStep && answer.why !== card.whyStep.correct) return 0;
  return 1;
}

// --- Reading the answer columns ----------------------------------------------

/** `cards.picked` → the correct indices, or null when the value is not a list of
 *  integers. */
export function parsePicked(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  return value.every((n) => typeof n === "number" && Number.isInteger(n)) ? (value as number[]) : null;
}

/** `cards.pairs` → the one-to-one mapping, or null when any pair is malformed. */
export function parsePairs(value: unknown): Pair[] | null {
  if (!Array.isArray(value)) return null;
  const pairs: Pair[] = [];
  for (const item of value) {
    if (!Array.isArray(item) || item.length !== 2) return null;
    const [left, right] = item;
    if (typeof left !== "number" || typeof right !== "number") return null;
    pairs.push([left, right]);
  }
  return pairs;
}

/** `cards.constraints` → the required `before` pairs. The column is a single
 *  `{ before: Pair[] }` object so richer constraints can be added later. */
export function parseConstraints(value: unknown): Pair[] | null {
  if (!value || typeof value !== "object") return null;
  return parsePairs((value as { before?: unknown }).before);
}

/** `cards.why_step` → the why-step, or null when it is absent or malformed. */
export function parseWhyStep(value: unknown): WhyStep | null {
  if (!value || typeof value !== "object") return null;
  const { options, correct } = value as { options?: unknown; correct?: unknown };
  const list = Array.isArray(options) ? options.filter((o): o is string => typeof o === "string") : [];
  if (!list.length || typeof correct !== "number" || !Number.isInteger(correct) || correct < 0 || correct >= list.length) return null;
  return { options: list, correct };
}
