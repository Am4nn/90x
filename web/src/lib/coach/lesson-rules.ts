import { addDays } from "@/lib/tracker/dates";
import { LANGUAGE_LABEL, referenceSolution } from "./review-rules";

// Pattern lessons: the worked example, the ladder and the
// lesson's system prompt, built only from our own problems and tricks. Pure;
// lib/coach/lesson.ts loads the data.

export type LessonProblem = {
  slug: string;
  title: string;
  difficulty: string;
  importance: number;
  premium: boolean;
  statementMd: string | null;
  solutions: Record<string, string>;
};

export type LessonMaterial = {
  pattern: { slug: string; name: string; description: string | null };
  tricks: {
    name: string;
    idea: string;
    snippet: { language: string; code: string } | null;
    problems: { slug: string; title: string }[];
  }[];
  example: (LessonProblem & { solution: { language: string; code: string } }) | null;
  ladder: LessonProblem[];
  language: string | null;
  memory: string;
  today: string;
};

const RANK: Record<string, number> = { Easy: 0, Medium: 1, Hard: 2 };
const rank = (d: string) => RANK[d] ?? 3;
const LADDER_MAX = 5;
const STATEMENT_MAX_CHARS = 4000;

/** Lowest difficulty, then highest importance, among problems with a statement and a solution. */
export function workedExample(problems: LessonProblem[]): LessonProblem | null {
  return (
    problems
      .filter((p) => p.statementMd && Object.values(p.solutions).some(Boolean))
      .toSorted((a, b) => rank(a.difficulty) - rank(b.difficulty) || b.importance - a.importance)[0] ?? null
  );
}

/**
 * Up to 5 unsolved problems, easy to hard. Picked one per difficulty in turn
 * (most important first) so the ladder climbs instead of stopping at Easy.
 */
export function ladder(
  problems: LessonProblem[],
  opts: { solved: Set<string>; exclude: Set<string>; hasPremium: boolean },
): LessonProblem[] {
  const open = problems.filter((p) => !opts.solved.has(p.slug) && !opts.exclude.has(p.slug) && (opts.hasPremium || !p.premium));
  const buckets = [...new Set(open.map((p) => p.difficulty))]
    .toSorted((a, b) => rank(a) - rank(b))
    .map((d) => open.filter((p) => p.difficulty === d).toSorted((a, b) => b.importance - a.importance));
  const picked: LessonProblem[] = [];
  while (picked.length < LADDER_MAX && buckets.some((b) => b.length)) {
    for (const bucket of buckets) {
      const next = bucket.shift();
      if (next && picked.length < LADDER_MAX) picked.push(next);
    }
  }
  return picked.toSorted((a, b) => rank(a.difficulty) - rank(b.difficulty) || b.importance - a.importance);
}

/** First rung today, the rest tomorrow; all today when tomorrow is past the campaign. */
export function ladderDays(slugs: string[], today: string, lastDay: string): { slug: string; date: string }[] {
  const tomorrow = addDays(today, 1);
  return slugs.map((slug, i) => ({ slug, date: i === 0 || tomorrow > lastDay ? today : tomorrow }));
}

export const pickTrickSnippet = referenceSolution;

const ref = (p: { slug: string; title: string }) => `${p.title} (problem:${p.slug})`;
const label = (language: string) => LANGUAGE_LABEL[language] ?? language;

export function lessonPrompt(m: LessonMaterial): string {
  const { pattern, example } = m;
  const intro = `You are Coach, teaching the ${pattern.name} pattern to one person preparing for coding interviews.
Today is ${m.today}. ${m.language ? `They write ${label(m.language)}; show code in it.` : ""}

Teach ONLY from the material below. Never invent problems, examples, tricks or solutions that are not in it. If they ask about a problem that isn't here, say it isn't part of this lesson. When you name a problem, use its title.

How to teach, one short message at a time:
1. The core idea in 3-4 lines, built from the pattern description and the tricks.
2. The tricks, briefly, each with its snippet and the problems that use it.
3. The worked example, step by step. At each step ask them for the next move, wait for their answer, then confirm or correct it before going on. One question per message.
4. The ladder: list it and offer to queue it. If they agree, call queue_ladder with up to 3 slugs from the ladder; it only proposes, they confirm.
5. When the lesson is done (or they want to stop), call finish_lesson with a short summary of what they got and what was weak.`;

  const tricks = m.tricks.length
    ? m.tricks
        .map((t) =>
          [
            `### ${t.name}`,
            t.idea,
            t.snippet ? `Snippet (${label(t.snippet.language)}):\n\`\`\`\n${t.snippet.code}\n\`\`\`` : null,
            t.problems.length ? `Used in: ${t.problems.map(ref).join(", ")}` : null,
          ]
            .filter(Boolean)
            .join("\n"),
        )
        .join("\n\n")
    : "No tricks are catalogued for this pattern yet; teach from the description and the worked example.";

  const worked = example
    ? [
        `${ref(example)}, ${example.difficulty}`,
        `Statement:\n${(example.statementMd ?? "").slice(0, STATEMENT_MAX_CHARS)}`,
        `Reference solution (${label(example.solution.language)}):\n\`\`\`\n${example.solution.code}\n\`\`\``,
      ].join("\n\n")
    : "There is no worked example for this pattern in our bank; skip step 3.";

  const rungs = m.ladder.length
    ? m.ladder.map((p, i) => `${i + 1}. ${ref(p)}, ${p.difficulty}`).join("\n")
    : "They have no unsolved problems left in this pattern; skip step 4.";

  return [
    intro,
    `## Pattern: ${pattern.name}\n${pattern.description ?? ""}`.trim(),
    `## Tricks\n${tricks}`,
    `## Worked example\n${worked}`,
    `## Ladder (easy to hard, unsolved)\n${rungs}`,
    `## What you know about them\n${m.memory || "Nothing yet."}`,
  ].join("\n\n");
}
