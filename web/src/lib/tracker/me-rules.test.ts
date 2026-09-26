import { describe, expect, it } from "vitest";
import { weakestPatterns } from "./me-rules";

const p = (slug: string, solved: number, failed: number, total = 10) => ({ slug, name: slug, solved, failed, total, state: "started" as const });

describe("weakestPatterns", () => {
  it("ranks attempted patterns by success rate, lowest first", () => {
    const got = weakestPatterns([p("a", 5, 0), p("b", 1, 3), p("c", 2, 2), p("d", 0, 0)], 2);
    expect(got.map((x) => x.slug)).toEqual(["b", "c"]);
  });

  it("ignores patterns never tried", () => {
    expect(weakestPatterns([p("d", 0, 0)], 3)).toEqual([]);
  });

  it("describes each one", () => {
    expect(weakestPatterns([p("b", 1, 3)], 1)[0].detail).toBe("1 solved, 3 failed");
  });
});
