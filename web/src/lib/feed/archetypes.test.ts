import { describe, expect, it } from "vitest";
import { ARCHETYPES, PRIMITIVES, archetype, shapeOf } from "./archetypes";

const AREAS = ["dsa", "system_design", "cs", "java", "sql"] as const;

describe("archetype registry", () => {
  it("has 47 archetypes with no duplicate ids, every one round-tripping through archetype()", () => {
    expect(ARCHETYPES).toHaveLength(47);
    const ids = ARCHETYPES.map((a) => a.id);
    expect(new Set(ids).size).toBe(47);
    for (const entry of ARCHETYPES) {
      expect(archetype(entry.id)).toBe(entry);
    }
  });

  it("names only known primitives, and shapeOf agrees with the registry for all ten", () => {
    const known = new Set(PRIMITIVES.map((p) => p.id));
    for (const entry of ARCHETYPES) {
      for (const primitive of entry.primitives) {
        expect(known.has(primitive)).toBe(true);
      }
    }
    expect(PRIMITIVES).toHaveLength(10);
    for (const primitive of PRIMITIVES) {
      expect(shapeOf(primitive.id)).toBe(primitive.shape);
    }
    expect(shapeOf("self_rate")).toBeNull();
  });

  it("uses only the five Feed areas, and flash is the only archetype without a why-step", () => {
    for (const entry of ARCHETYPES) {
      for (const area of entry.areas) {
        expect(AREAS).toContain(area);
      }
    }
    const withoutWhy = ARCHETYPES.filter((a) => !a.whyStep).map((a) => a.id);
    expect(withoutWhy).toEqual(["flash"]);
  });

  it("names the four dual-primitive archetypes as pick_one plus numeric", () => {
    const dual = ARCHETYPES.filter((a) => a.primitives.length === 2).map((a) => a.id);
    expect(dual).toEqual(["complexity", "trace-the-value", "estimate", "impossible-bound"]);
    for (const entry of ARCHETYPES) {
      if (entry.primitives.length === 2) {
        expect(entry.primitives).toEqual(["pick_one", "numeric"]);
      }
    }
  });

  it("defaults every archetype to all three difficulties except flash, which is Easy only", () => {
    for (const entry of ARCHETYPES) {
      if (entry.id === "flash") {
        expect(entry.difficulty).toEqual(["Easy"]);
      } else {
        expect(entry.difficulty).toEqual(["Easy", "Medium", "Hard"]);
      }
    }
  });
});
