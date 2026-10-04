import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Every file that picks a model is a place the app spends money. Each one must ask the
// guard first (paused, past the hard stop, or this person's daily cap), or a new AI
// feature ships outside the caps. The two files that define the models are exempt: they
// choose a model, they do not run one.

const ROOT = join(process.cwd(), "src");
const EXEMPT = new Set(["lib/ai.ts", "lib/coach/model.ts"]);
const PICKS_A_MODEL = /\b(fastModel|smartModel|coachModel)\b/;

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return sources(path);
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [path] : [];
  });
}

const spenders = sources(ROOT)
  .map((path) => ({ path, rel: relative(ROOT, path).replaceAll("\\", "/"), text: readFileSync(path, "utf8") }))
  .filter((f) => PICKS_A_MODEL.test(f.text) && !EXEMPT.has(f.rel));

describe("AI guard coverage", () => {
  it("finds the places that spend", () => {
    expect(spenders.length).toBeGreaterThanOrEqual(6);
  });

  it.each(spenders.map((f) => [f.rel, f.text] as const))("%s asks aiGate() before it spends", (_rel, text) => {
    expect(text).toMatch(/await aiGate\(/);
  });
});

// Every call that makes the model write must say how much it may write.
describe("AI output limits", () => {
  const callers = sources(ROOT)
    .map((path) => ({ rel: relative(ROOT, path).replaceAll("\\", "/"), text: readFileSync(path, "utf8") }))
    .filter((f) => /\b(generateText|streamText)\(/.test(f.text));

  it("finds the calls", () => {
    expect(callers.length).toBeGreaterThanOrEqual(6);
  });

  it.each(callers.map((f) => [f.rel, f.text] as const))("%s sets maxOutputTokens on every call", (_rel, text) => {
    const calls = text.match(/\b(generateText|streamText)\(/g)?.length ?? 0;
    const limits = text.match(/maxOutputTokens:/g)?.length ?? 0;
    expect(limits).toBeGreaterThanOrEqual(calls);
  });
});
