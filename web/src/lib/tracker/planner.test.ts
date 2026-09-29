import { describe, expect, it } from "vitest";
import { type PlannerInput, planDay } from "./planner";

const pattern = (slug: string, solved: number, failed: number, total = 10) => ({
  slug,
  name: slug.replace("-", " "),
  total,
  solved,
  failed,
  state: (solved + failed === 0 ? "untouched" : failed > solved ? "weak" : "started") as "untouched" | "weak" | "started",
});
const problem = (
  slug: string,
  patternSlug: string,
  importance: number,
  extra: Partial<{ premium: boolean; companies: Record<string, number>; difficulty: "Easy" | "Medium" | "Hard" }> = {},
) => ({
  slug,
  title: slug,
  patternSlug,
  importance,
  premium: extra.premium ?? false,
  companies: extra.companies ?? {},
  difficulty: extra.difficulty ?? "Medium",
});

const base = (): PlannerInput => ({
  date: "2026-09-27",
  slots: { new_problem: 1, review: 0, topic: 1, cards: 1 },
  dueReviews: [],
  patterns: [pattern("arrays", 5, 0), pattern("sliding-window", 1, 3), pattern("graphs", 0, 0)],
  problems: [
    problem("two-sum", "arrays", 1),
    problem("min-window", "sliding-window", 0.9),
    problem("max-window", "sliding-window", 0.8),
    problem("islands", "graphs", 0.95),
  ],
  attempted: new Set(),
  topics: [
    { slug: "caching", name: "Caching", area: "system_design", importance: 0.9 },
    { slug: "sharding", name: "Sharding", area: "system_design", importance: 0.7 },
    { slug: "jvm", name: "JVM", area: "java", importance: 0.8 },
  ],
  studied: new Set(),
  declaredNew: new Set(),
  areaScores: { system_design: 40, java: null },
  hasPremium: false,
  companyFocus: null,
  hasLiveCards: false,
});

const refs = (input: PlannerInput, type: string) =>
  planDay(input)
    .filter((m) => m.slotType === type)
    .map((m) => m.ref);

describe("planDay", () => {
  it("picks the most important unsolved problem in the weakest pattern, with a reason", () => {
    const [m] = planDay(base()).filter((x) => x.slotType === "new_problem");
    expect(m?.ref).toBe("min-window");
    expect(m?.reason).toMatch(/sliding window/i);
  });

  it("skips attempted and premium problems (unless the user has premium)", () => {
    const input = { ...base(), attempted: new Set(["min-window"]) };
    input.problems = [...input.problems, problem("prem", "sliding-window", 0.99, { premium: true })];
    expect(refs(input, "new_problem")).toEqual(["max-window"]);
    expect(refs({ ...input, hasPremium: true }, "new_problem")).toEqual(["prem"]);
  });

  it("falls back to the next pattern when the weakest has nothing left", () => {
    const input = { ...base(), attempted: new Set(["min-window", "max-window"]) };
    // next weakest: untouched graphs before started arrays
    expect(refs(input, "new_problem")).toEqual(["islands"]);
  });

  it("spreads several new problems across patterns and never repeats one", () => {
    const input = { ...base(), slots: { ...base().slots, new_problem: 3, review: 0 } };
    const got = refs(input, "new_problem");
    expect(got).toEqual(["min-window", "islands", "two-sum"]);
    expect(new Set(got).size).toBe(got.length);
  });

  it("boosts the focus company's problems while the focus is active", () => {
    const input = { ...base(), companyFocus: { company: "Google", from: "2026-09-20", to: "2026-10-01" } };
    input.problems = [...input.problems, problem("goog-window", "sliding-window", 0.5, { companies: { Google: 0.9 } })];
    expect(refs(input, "new_problem")).toEqual(["goog-window"]);
    const expired = { ...input, companyFocus: { company: "Google", from: "2026-09-01", to: "2026-09-10" } };
    expect(refs(expired, "new_problem")).toEqual(["min-window"]);
  });

  it("fills review slots most overdue first and never adds extra reviews", () => {
    const input = {
      ...base(),
      slots: { ...base().slots, review: 1 },
      dueReviews: [
        { slug: "a", title: "A", dueDate: "2026-09-26" },
        { slug: "b", title: "B", dueDate: "2026-09-20" },
      ],
    };
    expect(refs(input, "review")).toEqual(["b"]);
  });

  it("gives an unused review slot to a new problem", () => {
    const got = planDay({ ...base(), slots: { ...base().slots, review: 1 } });
    expect(got.filter((m) => m.slotType === "review")).toHaveLength(0);
    expect(got.filter((m) => m.slotType === "new_problem")).toHaveLength(2);
  });

  it("does not plan a review problem as a new one", () => {
    const input = { ...base(), dueReviews: [{ slug: "min-window", title: "Min window", dueDate: "2026-09-27" }] };
    expect(refs(input, "new_problem")).not.toContain("min-window");
  });

  it("picks the next topic from the weakest area, untouched areas first", () => {
    expect(refs(base(), "topic")).toEqual(["jvm"]);
    const javaDone = { ...base(), studied: new Set(["jvm"]) };
    expect(refs(javaDone, "topic")).toEqual(["caching"]);
  });

  it("leaves a topic slot out when every topic is studied", () => {
    const all = { ...base(), studied: new Set(["jvm", "caching", "sharding"]) };
    expect(refs(all, "topic")).toEqual([]);
  });

  it("card slots are coming soon until some cards are live", () => {
    const cards = planDay(base()).filter((m) => m.slotType === "cards");
    expect(cards).toHaveLength(1);
    expect(cards[0]?.status).toBe("coming_soon");
  });

  it("card slots become real missions once cards are live", () => {
    const [cards] = planDay({ ...base(), hasLiveCards: true }).filter((m) => m.slotType === "cards");
    expect(cards?.status).toBe("open");
    expect(cards?.title).toBe("10 cards");
  });

  it("returns an empty list rather than crashing on an empty catalog", () => {
    expect(planDay({ ...base(), problems: [], topics: [] }).filter((m) => m.status === "open")).toEqual([]);
  });
});

describe("level and the new problem", () => {
  it("with no level makes exactly the choice it made before levels existed", () => {
    // min-window, as this suite has asserted since before levels existed.
    expect(refs(base(), "new_problem")).toEqual(["min-window"]);
    expect(refs({ ...base(), level: null }, "new_problem")).toEqual(["min-window"]);
    expect(refs({ ...base(), level: "some_practice" }, "new_problem")).toEqual(["min-window"]);
  });

  it("first_time prefers an Easy problem over a Medium one of equal importance", () => {
    const input = base();
    input.problems = [
      problem("medium-one", "sliding-window", 0.9, { difficulty: "Medium" }),
      problem("easy-one", "sliding-window", 0.9, { difficulty: "Easy" }),
    ];
    // Equal scores, so with no level the first problem in the list stands.
    expect(refs(input, "new_problem")).toEqual(["medium-one"]);
    expect(refs({ ...input, level: "first_time" }, "new_problem")).toEqual(["easy-one"]);
    expect(refs({ ...input, level: "ready" }, "new_problem")).toEqual(["medium-one"]);
  });

  it("first_time takes an Easy problem within a grade of a Medium one, and ready the reverse", () => {
    const input = base();
    input.problems = [
      problem("medium-two", "sliding-window", 0.88, { difficulty: "Medium" }),
      problem("hard-two", "sliding-window", 0.88, { difficulty: "Hard" }),
      problem("easy-two", "sliding-window", 0.85, { difficulty: "Easy" }),
    ];
    expect(refs(input, "new_problem")).toEqual(["medium-two"]);
    expect(refs({ ...input, level: "first_time" }, "new_problem")).toEqual(["easy-two"]);
    expect(refs({ ...input, level: "ready" }, "new_problem")).toEqual(["hard-two"]);
  });

  it("still plans a problem for a first_time reader when only Hard ones are left", () => {
    const input = base();
    input.problems = [problem("only-hard", "sliding-window", 0.9, { difficulty: "Hard" })];
    expect(refs({ ...input, level: "first_time" }, "new_problem")).toEqual(["only-hard"]);
  });
});

describe("topics the reader declared new", () => {
  it("comes before a more important topic in the same area", () => {
    // The reader said outright they have not met this, which beats any
    // inference from importance.
    const plan = planDay({ ...base(), declaredNew: new Set(["sharding"]) });
    const topic = plan.find((m) => m.slotType === "topic");
    expect(topic?.ref).toBe("sharding");
    expect(topic?.reason).toBe("you marked this new to you in the Feed");
  });

  it("falls back to importance when nothing was declared", () => {
    const plan = planDay(base());
    const topic = plan.find((m) => m.slotType === "topic");
    expect(topic?.reason).toContain("next by importance");
  });

  it("still never plans a topic already studied", () => {
    const plan = planDay({ ...base(), declaredNew: new Set(["jvm"]), studied: new Set(["jvm"]) });
    expect(plan.find((m) => m.slotType === "topic")?.ref).not.toBe("jvm");
  });
});
