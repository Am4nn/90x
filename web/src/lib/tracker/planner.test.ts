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
const problem = (slug: string, patternSlug: string, importance: number, extra: Partial<{ premium: boolean; companies: Record<string, number> }> = {}) => ({
  slug,
  title: slug,
  patternSlug,
  importance,
  premium: extra.premium ?? false,
  companies: extra.companies ?? {},
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
  areaScores: { system_design: 40, java: null },
  hasPremium: false,
  companyFocus: null,
});

const refs = (input: PlannerInput, type: string) => planDay(input).filter((m) => m.slotType === type).map((m) => m.ref);

describe("planDay", () => {
  it("picks the most important unsolved problem in the weakest pattern, with a reason", () => {
    const [m] = planDay(base()).filter((x) => x.slotType === "new_problem");
    expect(m.ref).toBe("min-window");
    expect(m.reason).toMatch(/sliding window/i);
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

  it("marks card slots as coming soon", () => {
    const cards = planDay(base()).filter((m) => m.slotType === "cards");
    expect(cards).toHaveLength(1);
    expect(cards[0].status).toBe("coming_soon");
  });

  it("returns an empty list rather than crashing on an empty catalog", () => {
    expect(planDay({ ...base(), problems: [], topics: [] }).filter((m) => m.status === "open")).toEqual([]);
  });
});
