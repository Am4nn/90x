import { z } from "zod";
import { LANGUAGES } from "@/lib/setup";

// Solution review: the prompt, the model's fixed structure, and
// what we fix up before saving. Pure; lib/coach/solution-review.ts does I/O.

export const CODE_MAX_CHARS = 20_000;
const LINE_NOTES_MAX = 8;
const STATEMENT_MAX_CHARS = 6000;

const Complexity = z.object({ time: z.string().max(200), space: z.string().max(200) });

export const ReviewSchema = z.object({
  correct: z.boolean().describe("Does the code solve the problem for all valid inputs?"),
  complexity: z.object({ yours: Complexity, best: Complexity }),
  betterApproach: z.string().max(4000).describe("What the optimal solution does differently and why. Empty if theirs is optimal."),
  lineNotes: z
    .array(z.object({ line: z.number().int().positive().optional(), note: z.string().max(1000) }))
    .max(LINE_NOTES_MAX)
    .describe("Specific improvements, each tied to a line number of their code when it applies."),
  patternLesson: z.string().max(1000).describe("The one idea to keep from this problem."),
  nextProblemSlug: z.string().max(200).nullable().describe("Slug of one problem from the candidates that uses the same idea."),
});
export type Review = z.infer<typeof ReviewSchema>;

export const LANGUAGE_LABEL: Record<string, string> = Object.fromEntries(LANGUAGES.map((l) => [l.value, l.label]));
const label = (language: string) => LANGUAGE_LABEL[language] ?? language;

/** The reference solution in the user's language, else any we have. */
export function referenceSolution(solutions: Record<string, string>, language: string | null): { language: string; code: string } | null {
  if (language && solutions[language]) return { language, code: solutions[language] };
  const any = Object.entries(solutions).find(([, code]) => code);
  return any ? { language: any[0], code: any[1] } : null;
}

/** "  3| code" so the model and the page agree on line numbers. */
function numberLines(code: string): string {
  const lines = code.split("\n");
  const width = String(lines.length).length;
  return lines.map((l, i) => `${String(i + 1).padStart(width)}| ${l}`).join("\n");
}

export const lineCount = (code: string) => code.split("\n").length;

const RESULT_TEXT: Record<string, string> = { solved: "solved", hints: "solved with hints", failed: "didn't solve" };

export type ReviewInput = {
  problem: { title: string; difficulty: string; statementMd: string | null; patternName: string | null };
  language: string;
  code: string;
  reference: { language: string; code: string } | null;
  checkin: { result: string; minutes: number | null } | null;
  memory: string;
  /** Unsolved problems in the same pattern the model may pick the next problem from. */
  candidates?: { slug: string; title: string; difficulty: string }[];
};

const SYSTEM = `You are Coach, reviewing one person's solution to a coding-interview problem.
Be direct and specific. Judge correctness by reasoning about the code against the statement, including edge cases.
Complexity: give Big-O for their code and for the best known approach (use the reference solution as the best unless you are sure something is better).
Line notes: point at concrete lines (edge cases, off-by-one, redundant work, naming). Use the line numbers shown. At most ${LINE_NOTES_MAX}; skip praise.
Pattern lesson: one or two sentences, the idea to remember for similar problems.
Next problem: pick one slug from the candidate list that practises the same idea, or null if the list is empty.
Use what you know about the person (below) to focus the review on their recurring habits.`;

export function reviewPrompt(input: ReviewInput): { system: string; prompt: string } {
  const { problem, reference, checkin } = input;
  const parts = [
    `Problem: ${problem.title} (${problem.difficulty}${problem.patternName ? `, pattern: ${problem.patternName}` : ""})`,
    `Statement:\n${problem.statementMd ? problem.statementMd.slice(0, STATEMENT_MAX_CHARS) : "(not available: LeetCode Premium)"}`,
    reference
      ? `Reference solution (${label(reference.language)}):\n${reference.code}`
      : "No reference solution is available; judge from the statement.",
    checkin ? `Check-in: ${RESULT_TEXT[checkin.result] ?? checkin.result}${checkin.minutes ? ` in ${checkin.minutes} min` : ""}` : null,
    `Their code (${label(input.language)}):\n${numberLines(input.code)}`,
    input.candidates?.length
      ? `Candidates for the next problem:\n${input.candidates.map((c) => `- ${c.slug}: ${c.title} (${c.difficulty})`).join("\n")}`
      : "Candidates for the next problem: none.",
    `What you know about them:\n${input.memory || "Nothing yet."}`,
  ];
  return { system: SYSTEM, prompt: parts.filter(Boolean).join("\n\n") };
}

/** At most 8 non-empty notes; a line number outside their code is dropped, the note kept. */
export function cleanReview(review: Review, lines: number): Review {
  const lineNotes = review.lineNotes
    .filter((n) => n.note.trim())
    .slice(0, LINE_NOTES_MAX)
    .map((n) => (n.line && n.line <= lines ? { line: n.line, note: n.note.trim() } : { note: n.note.trim() }));
  return { ...review, lineNotes };
}

type Candidate = { slug: string; importance: number; premium: boolean };

/**
 * The model's next problem if it's real, unsolved, not this one and playable
 * (premium only with premium); otherwise the most important such problem in
 * the same pattern.
 */
export function pickNextProblem(opts: {
  suggested: { slug: string; premium: boolean } | null;
  current: string;
  samePattern: Candidate[];
  solved: Set<string>;
  hasPremium: boolean;
}): string | null {
  const ok = (p: { slug: string; premium: boolean }) =>
    p.slug !== opts.current && !opts.solved.has(p.slug) && (opts.hasPremium || !p.premium);
  if (opts.suggested && ok(opts.suggested)) return opts.suggested.slug;
  return opts.samePattern.filter(ok).toSorted((a, b) => b.importance - a.importance)[0]?.slug ?? null;
}

/** Plain-text digest of a review: memory extraction input and the follow-up prompt. */
export function reviewSummary(title: string, language: string, review: Review): string {
  const { yours, best } = review.complexity;
  return [
    `Solution review of ${title} in ${label(language)}: ${review.correct ? "correct" : "not correct"}.`,
    `Complexity: theirs time ${yours.time}, space ${yours.space}; best time ${best.time}, space ${best.space}.`,
    review.betterApproach && `Better approach: ${review.betterApproach}`,
    review.lineNotes.length > 0 && `Notes:\n${review.lineNotes.map((n) => `- ${n.line ? `line ${n.line}: ` : ""}${n.note}`).join("\n")}`,
    `Pattern lesson: ${review.patternLesson}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** System prompt for follow-up questions on a saved review (the `review` mode). */
export function followUpPrompt(input: {
  problem: ReviewInput["problem"];
  language: string;
  code: string;
  review: Review;
  memory: string;
}): string {
  const { problem } = input;
  return [
    `You are Coach. The person is asking follow-up questions about a solution review you already gave them.
Answer from the problem, their code and the review below. Be direct and short; refer to line numbers of their code.
If they ask for a full solution, give hints first and the full code only if they ask again.
Don't review a different problem here; suggest opening a new review for it.`,
    `Problem: ${problem.title} (${problem.difficulty}${problem.patternName ? `, pattern: ${problem.patternName}` : ""})\n${problem.statementMd ? problem.statementMd.slice(0, STATEMENT_MAX_CHARS) : "(statement not available)"}`,
    `Their code (${label(input.language)}):\n${numberLines(input.code)}`,
    `Your review:\n${reviewSummary(problem.title, input.language, input.review)}`,
    `What you know about them:\n${input.memory || "Nothing yet."}`,
  ].join("\n\n");
}
