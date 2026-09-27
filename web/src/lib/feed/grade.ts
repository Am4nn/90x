// Grading that needs no AI: exact matches, output cards, multiple choice, and
// the score → outcome/FSRS rating rules every graded answer goes through.

export type CardFormat = "typed" | "flash" | "mcq" | "output" | "bug";
export type CardForGrading = { format: CardFormat; answer: string; keyPoints: string[]; options: string[] | null };
export type Outcome = "correct" | "wrong" | "skipped";
/** Again, Hard, Good, Easy (same numbers as ts-fsrs Rating). */
export type Rating = 1 | 2 | 3 | 4;

export const PASS_MARK = 0.7;
/** A correct pick after "Show options": counts as correct, at the weakest rating. */
export const OPTIONS_SCORE = 0.7;

const FENCE = /```[\w+-]*/g;

export function normalize(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(FENCE, " ")
      // Apostrophes vanish so "it's" stays one word; other punctuation splits words.
      .replace(/['’]/g, "")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

// Key points must match whole words: "1" must not be found inside "10".
const containsWords = (haystack: string, needle: string) => ` ${haystack} `.includes(` ${needle} `);

export function exactMatch(answer: string, card: CardForGrading): boolean {
  const given = normalize(answer);
  if (!given) return false;
  if (given === normalize(card.answer)) return true;
  const points = card.keyPoints.map(normalize).filter(Boolean);
  return points.length > 0 && points.every((point) => containsWords(given, point));
}

// Program output: only layout is forgiven. Signs, brackets and case are part of
// the answer ("-1" is not "1"), so this does not use normalize().
const compactOutput = (text: string) => text.replace(FENCE, "").replace(/[`\s]/g, "");

export function gradeOutput(answer: string, card: CardForGrading): number {
  const given = compactOutput(answer);
  return given !== "" && given === compactOutput(card.answer) ? 1 : 0;
}

export function correctOptionIndex(answer: string, options: string[]): number {
  const byText = options.findIndex((option) => normalize(option) === normalize(answer));
  if (byText !== -1) return byText;
  const key = answer.trim();
  if (/^[a-z]$/i.test(key)) return key.toUpperCase().charCodeAt(0) - "A".charCodeAt(0);
  if (/^\d+$/.test(key)) return Number(key);
  return -1;
}

export function gradeOption(choice: number, card: CardForGrading): number {
  const { options } = card;
  if (!options || !Number.isInteger(choice) || choice < 0 || choice >= options.length) return 0;
  return choice === correctOptionIndex(card.answer, options) ? OPTIONS_SCORE : 0;
}

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

export function keyPointScore(hits: boolean[]): number {
  if (hits.length === 0) return 0;
  return hits.filter(Boolean).length / hits.length;
}
