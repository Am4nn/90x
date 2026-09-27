import type { LanguageModelUsage } from "ai";
import { describe, expect, it } from "vitest";
import { billedTokens, budgetState, costUsd } from "./cost";

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

const step = (inputTokens: number, outputTokens: number, raw?: LanguageModelUsage["raw"]) => ({
  usage: { inputTokens, outputTokens, raw } as LanguageModelUsage,
});

describe("billedTokens", () => {
  it("adds thinking that total_tokens bills beyond prompt + completion", () => {
    const s = step(100, 20, { prompt_tokens: 100, completion_tokens: 20, total_tokens: 620 });
    expect(billedTokens([s])).toEqual({ tokensIn: 100, tokensOut: 520 });
  });

  it("adds nothing when completion already includes the thinking", () => {
    const s = step(100, 520, { prompt_tokens: 100, completion_tokens: 520, total_tokens: 620 });
    expect(billedTokens([s])).toEqual({ tokensIn: 100, tokensOut: 520 });
  });

  it("sums every step of a tool-using call, including each step's hidden tokens", () => {
    const a = step(100, 10, { prompt_tokens: 100, completion_tokens: 10, total_tokens: 310 });
    const b = step(400, 50, { prompt_tokens: 400, completion_tokens: 50, total_tokens: 450 });
    expect(billedTokens([a, b])).toEqual({ tokensIn: 500, tokensOut: 260 });
  });

  it("uses the normalized counts when the provider sends no raw usage", () => {
    expect(billedTokens([step(100, 20)])).toEqual({ tokensIn: 100, tokensOut: 20 });
  });
});
