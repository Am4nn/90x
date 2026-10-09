import { describe, expect, it } from "vitest";
import { gradeChosen, outcomeOf } from "@/lib/feed/grade";
import { verdictText } from "@/lib/feed/view";
import { PROOF_COUNTS } from "./proof";
import { FIRST_CORRECT_DAYS } from "./review-days";
import { TRY_CARDS, TRY_COPY, TRY_CTA, LISTEN_TAB, nextTarget, TRY_LESSON, tryNextLabel, tryVerdict } from "./try-cards";

const card = (key: string) => {
  const found = TRY_CARDS.find((c) => c.key === key);
  if (!found) throw new Error(`no try card ${key}`);
  return found;
};

// The card's snippet, line for line (it is C++ on the card). Counts every move of `left`.
const run = (s: string) => {
  const seen = new Set<string>();
  let left = 0;
  let best = 0;
  let removals = 0;
  for (let right = 0; right < s.length; right++) {
    const ch = s.charAt(right);
    while (seen.has(ch)) {
      seen.delete(s.charAt(left));
      left++;
      removals++;
    }
    seen.add(ch);
    best = Math.max(best, right - left + 1);
  }
  return { best, removals };
};

function merges<T>(a: T[], b: T[]): T[][] {
  const [a0, ...aRest] = a;
  const [b0, ...bRest] = b;
  if (a0 === undefined) return [b];
  if (b0 === undefined) return [a];
  return [...merges(aRest, b).map((m) => [a0, ...m]), ...merges(a, bRest).map((m) => [b0, ...m])];
}
describe("the three try cards", () => {
  it("are system design, DSA and SQL pick-ones, in that tab order, each with four options and a valid answer", () => {
    expect(TRY_CARDS.map((c) => [c.key, c.tab, c.tabShort, c.area, c.kind])).toEqual([
      ["sd", "System design", "Design", "System design", "Pick one"],
      ["dsa", "DSA", "DSA", "DSA", "Pick one"],
      ["sql", "SQL", "SQL", "SQL", "Pick one"],
    ]);
    for (const c of TRY_CARDS) {
      expect(c.options).toHaveLength(4);
      expect(new Set(c.options).size).toBe(4);
      expect([0, 1, 2, 3]).toContain(c.correct);
      expect(c.difficulty).toBe("Medium");
    }
    expect(card("sd").topic).toBe("Caching");
    expect(card("dsa").topic).toBe("Sliding window");
    expect(card("sql").topic).toBe("Joins");
  });

  it("carry the approved page copy verbatim", () => {
    expect(TRY_COPY).toEqual({
      heading: "Try a card.",
      lede: "No sign-in. Ren marks the card. The lesson plays, 7 minutes.",
    });
    expect(TRY_CTA).toBe("Continue with Google to get your Day 1");
  });

  it("use no percentage and no promise of time (the TTL in the system design card is not one)", () => {
    for (const c of TRY_CARDS) {
      expect([c.prompt, c.code ?? "", ...c.options, c.answer, c.keyPoint].join(" ")).not.toMatch(
        /%|minutes a day|a day\b|per day|20 minutes/i,
      );
    }
  });
});

describe("DSA: the longest substring without a repeated character", () => {
  it("the snippet on the card is the one modelled here", () => {
    expect(card("dsa").code).toBe(
      [
        "std::unordered_set<char> seen;",
        "int left = 0, best = 0;",
        "for (int right = 0; right < s.size(); ++right) {",
        "    while (seen.count(s[right])) {",
        "        seen.erase(s[left]); ++left;",
        "    }",
        "    seen.insert(s[right]);",
        "    best = std::max(best, right - left + 1);",
        "}",
        "return best;",
      ].join("\n"),
    );
  });

  it("returns the longest substring length", () => {
    expect(run("abcabcbb").best).toBe(3);
    expect(run("bbbbb").best).toBe(1);
    expect(run("pwwkew").best).toBe(3);
    expect(run("").best).toBe(0);
  });

  it("moves left at most n times in total, so the nested loop is O(n), not O(n squared)", () => {
    const worst = ["a".repeat(2000), "ab".repeat(1000), "abcdefghij".repeat(200), "abcdefghijklmnopqrstuvwxyz".repeat(80)];
    for (const s of worst) {
      expect(run(s).removals).toBeLessThanOrEqual(s.length);
      expect(run(s).removals).toBeLessThan((s.length * s.length) / 100);
    }
  });

  it("the right option is the O(n) one, and the answer says why", () => {
    const c = card("dsa");
    expect(c.correct).toBe(1);
    expect(c.options[1]).toBe("O(n), because each index enters and leaves the window at most once");
    expect(c.options[0]).toContain("O(n²)");
    expect(c.answer.startsWith("O(n).")).toBe(true);
    expect(c.keyPoint).toBe("Count how far each pointer moves in total. A loop inside a loop is not automatically O(n²).");
  });
});

describe("SQL: which join keeps customers who placed no order in 2026", () => {
  interface Order {
    id: number;
    customer_id: number;
    year: number;
  }
  const customers = [
    { id: 1, name: "Ana" }, // an order in 2026
    { id: 2, name: "Bo" }, // an order, but in 2025
    { id: 3, name: "Cy" }, // no orders
  ];
  const orders: Order[] = [
    { id: 10, customer_id: 1, year: 2026 },
    { id: 11, customer_id: 2, year: 2025 },
  ];
  type Row = { name: string | null; order: number | null; year: number | null };
  const onKey = (c: { id: number }, o: Order) => o.customer_id === c.id;

  // Each option as the database evaluates it, row by row.
  const leftJoinWhereYear = (): Row[] =>
    customers
      .flatMap((c): Row[] => {
        const m = orders.filter((o) => onKey(c, o));
        return m.length
          ? m.map((o) => ({
              name: c.name,
              order: o.id,
              year: o.year as number | null,
            }))
          : [{ name: c.name, order: null, year: null }];
      })
      .filter((r) => r.year === 2026); // NULL = 2026 is not true: the row goes
  const leftJoinYearInOn = (): Row[] =>
    customers.flatMap((c): Row[] => {
      const m = orders.filter((o) => onKey(c, o) && o.year === 2026);
      return m.length ? m.map((o) => ({ name: c.name, order: o.id, year: o.year })) : [{ name: c.name, order: null, year: null }];
    });
  const innerJoinYearInOn = (): Row[] =>
    customers.flatMap((c) =>
      orders.filter((o) => onKey(c, o) && o.year === 2026).map((o) => ({ name: c.name, order: o.id, year: o.year })),
    );
  const rightJoinYearInOn = (): Row[] =>
    orders.flatMap((o): Row[] => {
      const m = customers.filter((c) => onKey(c, o) && o.year === 2026);
      return m.length ? m.map((c) => ({ name: c.name, order: o.id, year: o.year })) : [{ name: null, order: o.id, year: o.year }];
    });
  const evaluate = [leftJoinWhereYear, leftJoinYearInOn, innerJoinYearInOn, rightJoinYearInOn];
  const keepsEveryCustomer = (rows: Row[]) => customers.every((c) => rows.some((r) => r.name === c.name));

  it("the options are the four joins modelled here, in this order", () => {
    const o = card("sql").options;
    expect(o[0]).toBe("LEFT JOIN orders o ON o.customer_id = c.id\nWHERE o.year = 2026");
    expect(o[1]).toBe("LEFT JOIN orders o ON o.customer_id = c.id\n  AND o.year = 2026");
    expect(o[2]).toBe("JOIN orders o ON o.customer_id = c.id\n  AND o.year = 2026");
    expect(o[3]).toBe("RIGHT JOIN orders o ON o.customer_id = c.id\n  AND o.year = 2026");
  });

  it("only the LEFT JOIN with the year test in ON keeps every customer, and it is the marked answer", () => {
    const keeps = evaluate.map((fn) => keepsEveryCustomer(fn()));
    expect(keeps).toEqual([false, true, false, false]);
    expect(card("sql").correct).toBe(keeps.indexOf(true));
  });

  it("the WHERE version drops the customers with no 2026 order, so it behaves like an inner join", () => {
    expect(leftJoinWhereYear().map((r) => r.name)).toEqual(["Ana"]);
    expect(leftJoinWhereYear()).toEqual(innerJoinYearInOn());
  });

  it("the right answer keeps Bo and Cy with NULLs in the order columns", () => {
    expect(leftJoinYearInOn()).toContainEqual({
      name: "Bo",
      order: null,
      year: null,
    });
    expect(leftJoinYearInOn()).toContainEqual({
      name: "Cy",
      order: null,
      year: null,
    });
  });

  it("the card's query stub selects c.name and o.id from customers c, and its options are set in mono", () => {
    expect(card("sql").code).toBe("SELECT c.name, o.id\nFROM customers c\n-- which join goes here?");
    expect(card("sql").monoOptions).toBe(true);
    expect(card("sql").keyPoint).toBe(
      "A filter on the right-hand table of a LEFT JOIN goes in ON. In WHERE it turns the join into an inner join.",
    );
  });
});

describe("System design: the write path for a cache-aside price", () => {
  // Cache-aside with a stale entry. The writer is one of the four options; a reader that has
  // already missed the cache reads the database and then fills the cache with what it read.
  type World = { db: "old" | "new"; cache: "old" | "new" | null };
  type Step = (w: World, scratch: { read?: "old" | "new" }) => void;
  const writers: Record<string, (dbFails: boolean) => Step[]> = {
    cacheThenDb: (fail) => [(w) => void (w.cache = "new"), (w) => void (fail || (w.db = "new"))],
    deleteThenDb: (fail) => [(w) => void (w.cache = null), (w) => void (fail || (w.db = "new"))],
    dbThenDelete: (fail) => [(w) => void (fail || (w.db = "new")), (w) => void (w.cache = null)],
    dbOnly: (fail) => [(w) => void (fail || (w.db = "new"))],
  };
  const reader: Step[] = [(w, s) => void (s.read = w.db), (w, s) => void (w.cache = s.read ?? null)];
  const writerSteps = (writer: string, dbFails: boolean): Step[] => {
    const make = writers[writer];
    if (!make) throw new Error(`no writer ${writer}`);
    return make(dbFails);
  };
  /** How many interleavings leave a cache entry that disagrees with the database. */
  function stale(writer: string, withReader: boolean, dbFails: boolean) {
    const orders = withReader ? merges(writerSteps(writer, dbFails), reader) : [writerSteps(writer, dbFails)];
    return orders.filter((steps) => {
      const world: World = { db: "old", cache: "old" };
      const scratch: { read?: "old" | "new" } = {};
      for (const step of steps) step(world, scratch);
      return world.cache !== null && world.cache !== world.db;
    }).length;
  }
  const total = (writer: string) => [false, true].flatMap((r) => [false, true].map((f) => stale(writer, r, f))).reduce((a, b) => a + b, 0);

  it("the options are the four write paths modelled here, in this order", () => {
    expect(card("sd").options).toEqual([
      "Write the new price to the cache, then to the database",
      "Delete the cache key, then update the database",
      "Update the database, then delete the cache key",
      "Update only the database and let the TTL expire the old price",
    ]);
  });

  it("updating only the database leaves the old price in the cache (the problem the prompt describes)", () => {
    expect(stale("dbOnly", false, false)).toBe(1);
    expect(stale("dbThenDelete", false, false)).toBe(0);
  });

  it("writing the cache first can leave a price the database never stored", () => {
    expect(stale("cacheThenDb", false, true)).toBe(1);
    expect(stale("dbThenDelete", false, true)).toBe(0);
  });

  it("deleting first leaves a gap: a read between the delete and the commit caches the old price", () => {
    expect(stale("deleteThenDb", true, false)).toBeGreaterThan(stale("dbThenDelete", true, false));
  });

  it("delete-after-commit is the best of the four, and a rare race remains, which is why the TTL stays", () => {
    expect(stale("dbThenDelete", true, false)).toBeGreaterThan(0);
    for (const other of ["cacheThenDb", "deleteThenDb", "dbOnly"]) expect(total("dbThenDelete")).toBeLessThan(total(other));
    expect(card("sd").correct).toBe(2);
    expect(card("sd").answer).toContain("A rare race remains");
    expect(card("sd").keyPoint).toBe("Invalidate after the database commit, and keep the TTL as a backstop.");
  });
});

describe("the result the card shows is the Feed's own", () => {
  it("says Correct or Not quite, alone, using the Feed's verdict words", () => {
    const c = card("dsa");
    expect(tryVerdict(c, c.correct)).toMatchObject({
      correct: true,
      headline: verdictText("correct"),
    });
    expect(tryVerdict(c, (c.correct + 1) % 4)).toMatchObject({
      correct: false,
      headline: verdictText("wrong"),
    });
  });

  it("agrees with the Feed's own grading of a chosen answer, for every option of every card", () => {
    for (const c of TRY_CARDS) {
      for (let pick = 0; pick < 4; pick++) {
        const score = gradeChosen([pick], [c.correct]);
        expect(tryVerdict(c, pick).correct, `${c.key} ${pick}`).toBe(outcomeOf(score, false) === "correct");
      }
    }
  });

  it("says when the card comes back, from the same numbers the phone demo uses", () => {
    const c = card("sql");
    expect(tryVerdict(c, c.correct).next).toBe(`In your plan, this comes back in ${FIRST_CORRECT_DAYS} days.`);
    expect(tryVerdict(c, c.correct).next).toBe("In your plan, this comes back in 30 days.");
    expect(tryVerdict(c, (c.correct + 1) % 4).next).toBe("In your plan, this comes back tomorrow.");
  });
});

describe("the lesson and the next link", () => {
  it("says the real lesson, length and count", () => {
    expect(TRY_LESSON.slug).toBe("ai-generative-ai-llms");
    expect(TRY_LESSON.durationText).toBe("7:00");
    expect(TRY_LESSON.count).toBe(PROOF_COUNTS.lessons);
    expect(TRY_LESSON.opening).toHaveLength(2);
    expect(TRY_COPY.heading).toBe("Try a card.");
    expect(TRY_COPY.lede).toBe("No sign-in. Ren marks the card. The lesson plays, 7 minutes.");
  });
  it("names the next unanswered card, short on a phone, and the lesson once all are answered", () => {
    expect(tryNextLabel(0, [0, null, null], false)).toBe("Next card: DSA");
    expect(tryNextLabel(1, [0, 1, null], true)).toBe("Next card: SQL");
    expect(tryNextLabel(2, [null, 1, 2], false)).toBe("Next card: System design");
    expect(tryNextLabel(2, [null, 1, 2], true)).toBe("Next card: Design");
    expect(tryNextLabel(1, [0, 1, 2], false)).toBe("Hear the lesson");
  });
});

describe("next card: the label and the click share one target", () => {
  it("covers every answered/unanswered combination from every card tab", () => {
    for (let mask = 0; mask < 8; mask++) {
      const picks = [0, 1, 2].map((i) => ((mask >> i) & 1 ? 0 : null));
      for (let tab = 0; tab < 3; tab++) {
        const target = nextTarget(tab, picks);
        const want = target === LISTEN_TAB ? "Hear the lesson" : `Next card: ${TRY_CARDS[target]?.tab}`;
        const short = target === LISTEN_TAB ? "Hear the lesson" : `Next card: ${TRY_CARDS[target]?.tabShort}`;
        expect(tryNextLabel(tab, picks, false), `${mask}/${tab}`).toBe(want);
        expect(tryNextLabel(tab, picks, true), `${mask}/${tab}`).toBe(short);
        expect(target === LISTEN_TAB, `${mask}/${tab}`).toBe(picks.every((p) => p !== null));
        if (target !== LISTEN_TAB) expect(picks[target]).toBeNull();
      }
    }
  });
});
