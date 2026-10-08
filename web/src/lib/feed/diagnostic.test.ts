import { describe, expect, it } from "vitest";
import { DIAGNOSTIC_AREAS, pickDiagnostic } from "./diagnostic";

type PoolCard = Parameters<typeof pickDiagnostic>[0][number];
type Difficulty = PoolCard["difficulty"];

// Per area: 3 Easy, 4 Medium, 3 Hard, each on its own topic.
function fullPool(): PoolCard[] {
  const difficulties: Difficulty[] = ["Easy", "Easy", "Easy", "Medium", "Medium", "Medium", "Medium", "Hard", "Hard", "Hard"];
  return DIAGNOSTIC_AREAS.flatMap((area) =>
    difficulties.map((difficulty, i) => ({ id: `${area}-${i}`, area, difficulty, topic: `${area}-topic-${i}` })),
  );
}

const byId = (pool: PoolCard[]) => new Map(pool.map((card) => [card.id, card]));

describe("pickDiagnostic", () => {
  it("never picks a card the reader has already answered", () => {
    const pool = fullPool();
    const answered = new Set(pool.filter((card) => card.difficulty === "Easy").map((card) => card.id));
    const picked = pickDiagnostic(pool, 4, 1, answered);
    expect(picked).toHaveLength(20);
    expect(picked.filter((id) => answered.has(id))).toEqual([]);
    // Answered everything in an area: that area is simply left out.
    const dsa = new Set(pool.filter((card) => card.area === "dsa").map((card) => card.id));
    expect(pickDiagnostic(pool, 4, 1, dsa).some((id) => id.startsWith("dsa-"))).toBe(false);
  });

  it("picks 4 per area, interleaving the areas", () => {
    const pool = fullPool();
    const picked = pickDiagnostic(pool, undefined, 1);
    const cards = byId(pool);
    expect(picked).toHaveLength(20);
    expect(new Set(picked).size).toBe(20);
    expect(picked.slice(0, 10).map((id) => cards.get(id)?.area)).toEqual([...DIAGNOSTIC_AREAS, ...DIAGNOSTIC_AREAS]);
  });

  it("gives each area one Easy, two Medium and one Hard, easiest first", () => {
    const pool = fullPool();
    const cards = byId(pool);
    const picked = pickDiagnostic(pool, 4, 3);
    for (const area of DIAGNOSTIC_AREAS) {
      const difficulties = picked
        .map((id) => cards.get(id))
        .filter((card) => card?.area === area)
        .map((card) => card?.difficulty);
      expect(difficulties).toEqual(["Easy", "Medium", "Medium", "Hard"]);
    }
  });

  it("fills from any difficulty when one is missing", () => {
    const pool: PoolCard[] = [
      { id: "1", area: "sql", difficulty: "Easy", topic: "a" },
      { id: "2", area: "sql", difficulty: "Easy", topic: "b" },
      { id: "3", area: "sql", difficulty: null, topic: "c" },
      { id: "4", area: "sql", difficulty: "Medium", topic: "d" },
    ];
    expect(pickDiagnostic(pool, 4, 1).toSorted()).toEqual(["1", "2", "3", "4"]);
  });

  it("avoids two cards on one topic within an area when it can", () => {
    const pool: PoolCard[] = [
      { id: "e1", area: "java", difficulty: "Easy", topic: "streams" },
      { id: "m1", area: "java", difficulty: "Medium", topic: "streams" },
      { id: "m2", area: "java", difficulty: "Medium", topic: "streams" },
      { id: "m3", area: "java", difficulty: "Medium", topic: "gc" },
      { id: "h1", area: "java", difficulty: "Hard", topic: "jit" },
      { id: "e2", area: "java", difficulty: "Easy", topic: "generics" },
    ];
    const picked = pickDiagnostic(pool, 4, 1);
    const topics = picked.map((id) => pool.find((card) => card.id === id)?.topic);
    expect(new Set(topics).size).toBe(4);
  });

  it("repeats a topic when the area has nothing else", () => {
    const pool: PoolCard[] = ["1", "2", "3"].map((id) => ({ id, area: "cs", difficulty: "Medium", topic: "os" }));
    expect(pickDiagnostic(pool, 4, 1).toSorted()).toEqual(["1", "2", "3"]);
  });

  it("skips areas with no cards and ignores unknown areas", () => {
    const pool: PoolCard[] = [
      { id: "s", area: "sql", difficulty: "Easy", topic: "joins" },
      { id: "d", area: "dsa", difficulty: "Easy", topic: "arrays" },
      { id: "x", area: "behavioral", difficulty: "Easy", topic: "star" },
    ];
    expect(pickDiagnostic(pool, 4, 1)).toEqual(["d", "s"]);
    expect(pickDiagnostic([], 4, 1)).toEqual([]);
  });

  it("honours perArea", () => {
    expect(pickDiagnostic(fullPool(), 2, 1)).toHaveLength(10);
  });

  it("is deterministic for a seed and varies across seeds", () => {
    const pool = fullPool();
    expect(pickDiagnostic(pool, 4, 5)).toEqual(pickDiagnostic(pool, 4, 5));
    expect(pickDiagnostic(pool, 4, 5)).not.toEqual(pickDiagnostic(pool, 4, 6));
    expect(pickDiagnostic(pool)).toEqual(pickDiagnostic(pool));
  });
});
