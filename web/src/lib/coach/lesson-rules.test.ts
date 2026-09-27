import { describe, expect, it } from "vitest";
import { ladder, ladderDays, type LessonMaterial, type LessonProblem, lessonPrompt, pickTrickSnippet, workedExample } from "./lesson-rules";

const problem = (slug: string, difficulty: string, importance: number, over: Partial<LessonProblem> = {}): LessonProblem => ({
  slug,
  title: slug.replace(/-/g, " "),
  difficulty,
  importance,
  premium: false,
  statementMd: `Statement of ${slug}`,
  solutions: { python: `# solution of ${slug}`, java: `// java solution of ${slug}` },
  ...over,
});

const pool = [
  problem("contains-duplicate", "Easy", 0.9),
  problem("valid-anagram", "Easy", 0.8),
  problem("two-sum", "Easy", 1),
  problem("group-anagrams", "Medium", 0.85),
  problem("top-k-frequent", "Medium", 0.9),
  problem("longest-consecutive", "Medium", 0.7),
  problem("encode-decode", "Medium", 0.95, { premium: true, statementMd: null }),
  problem("first-missing-positive", "Hard", 0.6),
  problem("minor-hard", "Hard", 0.1),
];

describe("workedExample", () => {
  it("takes the easiest, most important problem that has a statement and a solution", () => {
    expect(workedExample(pool)?.slug).toBe("two-sum");
    const noSolution = pool.map((p) => (p.slug === "two-sum" ? { ...p, solutions: {} } : p));
    expect(workedExample(noSolution)?.slug).toBe("contains-duplicate");
  });
  it("is null when nothing qualifies", () => {
    expect(workedExample([problem("x", "Easy", 1, { statementMd: null })])).toBeNull();
  });
});

describe("ladder", () => {
  const opts = { solved: new Set<string>(), exclude: new Set(["two-sum"]), hasPremium: false };

  it("orders easy to hard, most important first within a difficulty", () => {
    const rungs = ladder(pool, opts).map((p) => p.slug);
    expect(rungs).toEqual(["contains-duplicate", "valid-anagram", "top-k-frequent", "group-anagrams", "first-missing-positive"]);
  });
  it("skips solved problems, the worked example and premium without premium", () => {
    const rungs = ladder(pool, { ...opts, solved: new Set(["contains-duplicate", "top-k-frequent"]) }).map((p) => p.slug);
    expect(rungs).not.toContain("contains-duplicate");
    expect(rungs).not.toContain("top-k-frequent");
    expect(rungs).not.toContain("two-sum");
    expect(rungs).not.toContain("encode-decode");
    expect(rungs[0]).toBe("valid-anagram");
  });
  it("includes premium problems for premium users", () => {
    expect(ladder(pool, { ...opts, hasPremium: true }).map((p) => p.slug)).toContain("encode-decode");
  });
  it("has at most 5 rungs, and spans difficulties when it can", () => {
    const rungs = ladder(pool, opts);
    expect(rungs.length).toBe(5);
    expect(new Set(rungs.map((r) => r.difficulty))).toEqual(new Set(["Easy", "Medium", "Hard"]));
  });
  it("returns what is left when fewer than 3 are unsolved", () => {
    const solved = new Set(pool.map((p) => p.slug).filter((s) => s !== "minor-hard"));
    expect(ladder(pool, { ...opts, solved }).map((p) => p.slug)).toEqual(["minor-hard"]);
  });
});

describe("ladderDays", () => {
  it("puts the first rung on today and the rest on tomorrow", () => {
    expect(ladderDays(["a", "b", "c"], "2026-09-28", "2026-12-01")).toEqual([
      { slug: "a", date: "2026-09-28" },
      { slug: "b", date: "2026-09-29" },
      { slug: "c", date: "2026-09-29" },
    ]);
  });
  it("keeps everything on today on the campaign's last day", () => {
    expect(ladderDays(["a", "b"], "2026-09-28", "2026-09-28").map((d) => d.date)).toEqual(["2026-09-28", "2026-09-28"]);
  });
});

describe("pickTrickSnippet", () => {
  it("prefers the user's language, then any", () => {
    expect(pickTrickSnippet({ java: "J", python: "P" }, "python")).toEqual({ language: "python", code: "P" });
    expect(pickTrickSnippet({ java: "J" }, "python")).toEqual({ language: "java", code: "J" });
    expect(pickTrickSnippet({}, "python")).toBeNull();
  });
});

describe("lessonPrompt", () => {
  const example = workedExample(pool);
  const rungs = ladder(pool, { solved: new Set(["valid-anagram"]), exclude: new Set(["two-sum"]), hasPremium: false });
  const material: LessonMaterial = {
    pattern: { slug: "arrays-hashing", name: "Arrays & Hashing", description: "Use a hash map to remember what you've seen." },
    tricks: [
      {
        name: "Seen set",
        idea: "Store each value; a repeat means a duplicate.",
        snippet: { language: "python", code: "seen = set()" },
        problems: [{ slug: "contains-duplicate", title: "contains duplicate" }],
      },
      { name: "Count map", idea: "Count characters to compare strings.", snippet: null, problems: [] },
    ],
    example: example ? { ...example, solution: { language: "python", code: "# solution of two-sum" } } : null,
    ladder: rungs,
    language: "python",
    memory: "Habits:\n- [m1] forgets empty input",
    today: "2026-09-28",
  };
  const prompt = lessonPrompt(material);

  it("contains the pattern, every trick, the worked example and the ladder", () => {
    expect(prompt).toContain("Arrays & Hashing");
    expect(prompt).toContain("Use a hash map to remember");
    expect(prompt).toContain("Seen set");
    expect(prompt).toContain("seen = set()");
    expect(prompt).toContain("Count map");
    expect(prompt).toContain("Statement of two-sum");
    expect(prompt).toContain("# solution of two-sum");
    for (const r of rungs) expect(prompt).toContain(`problem:${r.slug}`);
    expect(prompt).toContain("forgets empty input");
  });
  it("mentions only problems it was given", () => {
    const given = new Set([...rungs.map((r) => r.slug), "two-sum", ...material.tricks.flatMap((t) => t.problems.map((p) => p.slug))]);
    const mentioned = [...prompt.matchAll(/problem:([a-z0-9-]+)/g)].map((m) => m[1]);
    expect(mentioned.length).toBeGreaterThan(0);
    for (const slug of mentioned) expect(given.has(slug ?? "")).toBe(true);
    expect(prompt).not.toContain("valid-anagram");
    expect(prompt).not.toContain("java solution");
  });
  it("tells the model not to invent material and to teach step by step", () => {
    expect(prompt).toMatch(/never invent/i);
    expect(prompt).toMatch(/ask .* next move/i);
    expect(prompt).toContain("queue_ladder");
    expect(prompt).toContain("finish_lesson");
  });
  it("says what is missing instead of leaving gaps for the model to fill", () => {
    const bare = lessonPrompt({ ...material, tricks: [], example: null, ladder: [] });
    expect(bare).toMatch(/no worked example/i);
    expect(bare).toMatch(/no tricks/i);
    expect(bare).toMatch(/no unsolved problems/i);
    expect(bare).not.toMatch(/problem:/);
  });
});
