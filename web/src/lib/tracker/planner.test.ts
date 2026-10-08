import { describe, expect, it } from "vitest";
import { nextProblem, type PlannerInput, planDay } from "./planner";

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
  slots: { new_problem: 1, review: 0, topic: 1 },
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
    expect(m?.reason).toMatch(/^From your weakest pattern/);
  });

  it("never names a new problem's pattern, which would give the approach away", () => {
    const input = { ...base(), slots: { ...base().slots, new_problem: 3 }, focus: { patterns: ["graphs"], topics: [] } };
    const reasons = planDay(input)
      .filter((m) => m.slotType === "new_problem")
      .map((m) => m.reason);
    expect(reasons).toHaveLength(3);
    for (const r of reasons) expect(r).not.toMatch(/sliding window|graphs|arrays/i);
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
    // Frequency is 0-100: 90 adds 0.45, so 0.5 + 0.45 beats min-window's 0.9.
    input.problems = [...input.problems, problem("goog-window", "sliding-window", 0.5, { companies: { Google: 90 } })];
    expect(refs(input, "new_problem")).toEqual(["goog-window"]);
    const expired = { ...input, companyFocus: { company: "Google", from: "2026-09-01", to: "2026-09-10" } };
    expect(refs(expired, "new_problem")).toEqual(["min-window"]);
  });

  it("does not let a company that rarely asks a problem outrank a much more important one", () => {
    const input = { ...base(), companyFocus: { company: "Apple", from: "2026-09-20", to: "2026-10-01" } };
    // Asked once in a while (10 adds 0.05): 0.5 + 0.05 stays below min-window's 0.9.
    input.problems = [...input.problems, problem("apple-window", "sliding-window", 0.5, { companies: { Apple: 10 } })];
    const [m] = planDay(input).filter((x) => x.slotType === "new_problem");
    expect(m?.ref).toBe("min-window");
    expect(m?.reason).not.toContain("asked at Apple");
  });

  it("among equally important problems, the one the focus company asks most comes first", () => {
    const input = { ...base(), companyFocus: { company: "Apple", from: "2026-09-20", to: "2026-10-01" } };
    input.problems = [
      problem("rare", "sliding-window", 0.9, { companies: { Apple: 20 } }),
      problem("often", "sliding-window", 0.9, { companies: { Apple: 80 } }),
    ];
    const [m] = planDay(input).filter((x) => x.slotType === "new_problem");
    expect(m?.ref).toBe("often");
    expect(m?.reason).toContain("asked at Apple");
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

  it("the cards mission is coming soon until some cards are live", () => {
    const cards = planDay(base()).filter((m) => m.slotType === "cards");
    expect(cards).toHaveLength(1);
    expect(cards[0]?.status).toBe("coming_soon");
  });

  it("the cards mission becomes real once cards are live", () => {
    const [cards] = planDay({ ...base(), hasLiveCards: true }).filter((m) => m.slotType === "cards");
    expect(cards?.status).toBe("open");
    expect(cards?.title).toBe("10 cards");
    expect(cards?.ref).toBe("cards-1");
    expect(cards?.estMinutes).toBe(15);
  });

  it("every day has exactly one cards mission, whatever the template holds", () => {
    const slots = [
      { new_problem: 1, review: 0, topic: 0 },
      { new_problem: 3, review: 2, topic: 2 },
      // A stored plan from before cards left the template still has the key.
      { new_problem: 1, review: 1, topic: 1, cards: 4 } as PlannerInput["slots"],
    ];
    for (const live of [false, true]) {
      for (const s of slots) {
        const cards = planDay({ ...base(), slots: s, hasLiveCards: live }).filter((m) => m.slotType === "cards");
        expect(cards.map((m) => m.ref)).toEqual(["cards-1"]);
      }
    }
  });

  it("a day with no slots at all still gets its cards mission", () => {
    const planned = planDay({ ...base(), slots: { new_problem: 0, review: 0, topic: 0 }, hasLiveCards: true });
    expect(planned.map((m) => m.slotType)).toEqual(["cards"]);
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

const withFocus = (focus: PlannerInput["focus"], over: Partial<PlannerInput> = {}): PlannerInput => ({ ...base(), focus, ...over });
const slotsOf = (new_problem: number, topic = 1) => ({ new_problem, review: 0, topic, cards: 0 });
const withGraphs = () => [...base().problems, problem("bridges", "graphs", 0.5)];
const firstFocused = (date: string) =>
  refs(withFocus({ patterns: ["arrays", "graphs"], topics: [] }, { date, slots: slotsOf(1) }), "new_problem")[0];

describe("planDay with a weekly focus", () => {
  it("plans exactly as before when there is no focus", () => {
    const plain = planDay(base());
    expect(planDay(withFocus(null))).toEqual(plain);
    expect(planDay(withFocus({ patterns: [], topics: [] }))).toEqual(plain);
    expect(planDay(withFocus({ patterns: ["no-such"], topics: ["no-such"] }))).toEqual(plain);
  });

  it("puts one focus problem first, with the focus reason", () => {
    const [first] = planDay(withFocus({ patterns: ["graphs"], topics: [] }, { slots: slotsOf(1) })).filter(
      (m) => m.slotType === "new_problem",
    );
    expect(first?.ref).toBe("islands");
    expect(first?.reason).toBe("This week's focus");
  });

  it("fills the rest from the usual rotation and does not pick the focus pattern again that day", () => {
    const input = withFocus({ patterns: ["graphs"], topics: [] }, { slots: slotsOf(3), problems: withGraphs() });
    const got = planDay(input).filter((m) => m.slotType === "new_problem");
    expect(got.map((m) => m.ref)).toEqual(["islands", "min-window", "two-sum"]);
    expect(got[1]?.reason).not.toMatch(/focus/);
  });

  it("alternates between two focus patterns by day", () => {
    const days = ["2026-09-27", "2026-09-28", "2026-09-29", "2026-09-30"].map(firstFocused);
    expect(new Set(days)).toEqual(new Set(["two-sum", "islands"]));
    expect(days[0]).not.toBe(days[1]);
    expect(days[0]).toBe(days[2]);
    expect(days[1]).toBe(days[3]);
  });

  it("falls back silently when a focus pattern has nothing eligible", () => {
    const input = withFocus({ patterns: ["graphs"], topics: [] }, { attempted: new Set(["islands"]), slots: slotsOf(1) });
    const [m] = planDay(input).filter((x) => x.slotType === "new_problem");
    expect(m?.ref).toBe("min-window");
    expect(m?.reason).not.toMatch(/focus/);
  });

  it("uses the other focus pattern when the first has nothing eligible, on any day", () => {
    for (const date of ["2026-09-27", "2026-09-28"]) {
      const input = withFocus({ patterns: ["graphs", "arrays"], topics: [] }, { date, attempted: new Set(["islands"]), slots: slotsOf(1) });
      expect(refs(input, "new_problem")).toEqual(["two-sum"]);
    }
  });

  it("puts one focus topic first, then the rotation in another area", () => {
    const got = planDay(withFocus({ patterns: [], topics: ["caching"] }, { slots: slotsOf(0, 3) })).filter((m) => m.slotType === "topic");
    expect(got.map((m) => m.ref)).toEqual(["caching", "jvm", "sharding"]);
    expect(got[0]?.reason).toBe("This week's focus: Caching");
    expect(got[1]?.reason).not.toMatch(/focus/);
  });

  it("plans at most one focus topic a day", () => {
    const got = planDay(withFocus({ patterns: [], topics: ["caching", "jvm"] }, { slots: slotsOf(0, 2) })).filter(
      (m) => m.slotType === "topic",
    );
    expect(got).toHaveLength(2);
    expect(got.filter((m) => m.reason.startsWith("This week's focus"))).toHaveLength(1);
    expect(new Set(got.map((m) => m.ref)).size).toBe(2);
  });

  it("ignores a focus topic that is already studied", () => {
    const input = withFocus({ patterns: [], topics: ["caching"] }, { studied: new Set(["caching"]), slots: slotsOf(0, 1) });
    const [m] = planDay(input).filter((x) => x.slotType === "topic");
    expect(m?.reason).not.toMatch(/focus/);
    expect(m?.ref).not.toBe("caching");
  });
});

describe("nextProblem (Want more?)", () => {
  const focus = { patterns: ["graphs"], topics: [] };

  it("takes the focus pattern's problem first, with the focus reason", () => {
    const next = nextProblem(withFocus(focus), []);
    expect(next).toMatchObject({ slotType: "new_problem", ref: "islands", reason: "This week's focus", status: "open" });
  });

  it("skips problems already on today, falling to the next best in the focus pattern", () => {
    const input = withFocus(focus, { problems: withGraphs() });
    expect(nextProblem(input, ["islands"])?.ref).toBe("bridges");
  });

  it("falls back to the weakest-first rotation when the focus pattern has nothing left", () => {
    const next = nextProblem(withFocus(focus), ["islands"]);
    expect(next?.ref).toBe("min-window");
    expect(next?.reason).not.toMatch(/focus/);
  });

  it("uses the plain rotation with no focus, and walks it as problems are taken", () => {
    const input = base();
    expect(nextProblem(input, [])?.ref).toBe("min-window");
    expect(nextProblem(input, ["min-window"])?.ref).toBe("max-window");
    expect(nextProblem(input, ["min-window", "max-window"])?.ref).toBe("islands");
  });

  it("never offers an attempted or premium problem, and leaves the taken set alone", () => {
    const taken = new Set(["min-window"]);
    const input = {
      ...base(),
      attempted: new Set(["max-window"]),
      problems: [...base().problems, problem("paid", "arrays", 5, { premium: true })],
    };
    expect(nextProblem(input, taken)?.ref).toBe("islands");
    expect([...taken]).toEqual(["min-window"]);
  });

  it("is null when nothing eligible is left", () => {
    const all = base().problems.map((p) => p.slug);
    expect(nextProblem(base(), all)).toBeNull();
    expect(nextProblem({ ...base(), problems: [] }, [])).toBeNull();
  });
});
