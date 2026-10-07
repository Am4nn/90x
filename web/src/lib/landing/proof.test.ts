import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PROOF_COUNTS, PROOF_ITEMS, REPO_URL } from "./proof";

describe("the proof numbers", () => {
  it("are the four true numbers, in order, with the code link last", () => {
    expect(PROOF_ITEMS.map((i) => `${i.value} ${i.label}`)).toEqual(["3,693 problems", "273 lessons", "44 sources", "Code on GitHub, MIT"]);
    expect(PROOF_ITEMS[3]?.href).toBe(REPO_URL);
    expect(REPO_URL).toBe("https://github.com/Am4nn/90x");
  });

  it("agree with the product doc, which states the library's size and the source count", () => {
    // PRODUCT.md is at the repo root; vitest runs in web/.
    const doc = readFileSync(path.join(process.cwd(), "..", "PRODUCT.md"), "utf8");
    expect(doc).toContain(`${PROOF_COUNTS.problems.toLocaleString("en-US")} problems, ${PROOF_COUNTS.lessons} lessons`);
    expect(doc).toContain(`${PROOF_COUNTS.sources} public sources`);
  });

  it("claim nothing about people: no users, ratings or testimonials", () => {
    const all = PROOF_ITEMS.map((i) => `${i.value} ${i.label}`).join(" ");
    expect(all).not.toMatch(/user|member|learner|rating|rated|review|testimonial|%/i);
  });
});
