import { describe, expect, it } from "vitest";
import { budgetState, costUsd } from "./cost";

describe("costUsd", () => {
  it("prices tokens per million by model", () => {
    expect(costUsd("deepseek-flash", 1_000_000, 1_000_000)).toBeCloseTo(0.3 + 1.2);
  });

  it("counts unknown models conservatively rather than as free", () => {
    expect(costUsd("mystery-model", 1_000_000, 0)).toBeGreaterThan(0.5);
  });
});

describe("budgetState", () => {
  it("is ok under 80%, warns from 80%, over at 100%", () => {
    expect(budgetState(7.99, 10)).toBe("ok");
    expect(budgetState(8, 10)).toBe("warn");
    expect(budgetState(10, 10)).toBe("over");
  });
});
