import { describe, expect, it } from "vitest";
import { ARCHETYPES, PRIMITIVES, archetype, optionsShapeOf, shapeOf, type NumberAnswer, type WhyStep } from "./archetypes";

// Every area the catalogue covers. `ai`, `lld` and `behavioral` joined once
// archetypes were tagged for them; before that they had none, which is why 96
// topics produced no cards at all.
const AREAS = ["dsa", "system_design", "cs", "java", "sql", "ai", "lld", "behavioral"] as const;

describe("archetype registry", () => {
  it("has 54 archetypes with no duplicate ids, every one round-tripping through archetype()", () => {
    // 47 at first release, plus nine for ai, lld and behavioral, minus star-parts:
    // the blind gate rejected every card of it, 3 samples of 3, because matching
    // Situation/Task/Action/Result to their own descriptions is answerable from
    // the labels alone. It did not earn its place.
    expect(ARCHETYPES).toHaveLength(54);
    const ids = ARCHETYPES.map((a) => a.id);
    expect(new Set(ids).size).toBe(54);
    for (const entry of ARCHETYPES) {
      expect(archetype(entry.id)).toBe(entry);
    }
  });

  it("names only known primitives, and shapeOf agrees with the registry for all eleven", () => {
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
    // The one primitive with no answer shape: written, and marked against the card's
    // key points by a model.
    expect(shapeOf("compose")).toBeNull();
  });

  it("records the canonical cards.options shape for every primitive", () => {
    const byId = new Map(PRIMITIVES.map((p) => [p.id, p.optionsShape]));
    expect(byId).toEqual(
      new Map([
        ["pick_one", "list"],
        ["order", "list"],
        ["match", "match"],
        ["bucket", "bucket"],
        ["tap_in_place", "list"],
        ["assemble", "assemble"],
        ["numeric", "none"],
        ["claim_grid", "list"],
        ["grid_toggle", "grid"],
        ["compose", "none"],
      ]),
    );
    for (const primitive of PRIMITIVES) {
      expect(optionsShapeOf(primitive.id)).toBe(primitive.optionsShape);
    }
  });

  it("exports the answer-contract shapes (why-step and numeric)", () => {
    // Compile-time as much as runtime: if the generated types drift from the
    // shapes the graders consume, these assignments fail `tsc`.
    const whyStep: WhyStep = { options: ["rehashing rebalances", "nothing grows"], correct: 0 };
    const numeric: NumberAnswer = { value: 16, tolerance: 0.5 };
    expect(whyStep).toEqual({ options: ["rehashing rebalances", "nothing grows"], correct: 0 });
    expect(numeric).toEqual({ value: 16, tolerance: 0.5 });
  });

  it("uses only known areas, and every archetype takes a why-step but two", () => {
    for (const entry of ARCHETYPES) {
      for (const area of entry.areas) {
        expect(AREAS).toContain(area);
      }
      expect(entry.areas.length).toBeGreaterThan(0);
    }
    // `your-story` is
    // written prose marked against key points, so there is no second screen to
    // ask a reason on. Everything else carries one on Hard.
    const withoutWhy = ARCHETYPES.filter((a) => !a.whyStep).map((a) => a.id);
    expect(withoutWhy).toEqual(["your-story"]);
  });

  it("covers every area the Feed can serve", () => {
    // An area with no archetype generates nothing, silently. That is what left
    // ai, lld and behavioral on the old cards through the whole first run.
    for (const area of AREAS) {
      expect(ARCHETYPES.some((a) => (a.areas as readonly string[]).includes(area))).toBe(true);
    }
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

  it("gives every archetype all three difficulties but the few that cannot carry them", () => {
    // Each exception is a claim about the question, not a default: a flashcard has
    // no difficulty to vary, spotting a data leak is never a one-step question,
    // and labelling four sentences Situation/Task/Action/Result is never Hard.
    const NARROWER: Record<string, string[]> = {
      "data-leak-spotter": ["Medium", "Hard"],
    };
    for (const entry of ARCHETYPES) {
      expect(entry.difficulty).toEqual(NARROWER[entry.id] ?? ["Easy", "Medium", "Hard"]);
    }
  });
});
