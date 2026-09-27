import { describe, expect, it } from "vitest";
import { ageFacts, memoryBlock, planMerge } from "./memory-rules";

const fact = (over: Partial<Parameters<typeof planMerge>[0][number]> = {}) => ({
  id: "f1",
  kind: "habit" as const,
  text: "Shrinks the window before updating the answer",
  status: "active" as const,
  evidence: [{ kind: "checkin", id: "c1" }],
  updatedAt: "2026-09-01T00:00:00Z",
  ...over,
});

describe("planMerge", () => {
  it("adds new facts and skips ones already known (case and punctuation aside)", () => {
    const plan = planMerge(
      [fact()],
      {
        facts: [
          { kind: "habit", text: "shrinks the window before updating the answer." },
          { kind: "goal", text: "Amazon interview on Nov 20" },
        ],
        seen: [],
      },
      { kind: "thread", id: "t9" },
    );
    expect(plan.insert.map((f) => f.text)).toEqual(["Amazon interview on Nov 20"]);
    expect(plan.insert[0]?.evidence).toEqual([{ kind: "thread", id: "t9" }]);
  });

  it("a fact seen again gets the new evidence and becomes active again", () => {
    const plan = planMerge([fact({ status: "improving" })], { facts: [], seen: ["f1"] }, { kind: "review", id: "r1" });
    expect(plan.update).toEqual([
      {
        id: "f1",
        status: "active",
        evidence: [
          { kind: "checkin", id: "c1" },
          { kind: "review", id: "r1" },
        ],
      },
    ]);
  });

  it("ignores seen ids it doesn't know (the model can invent ids)", () => {
    expect(planMerge([fact()], { facts: [], seen: ["nope"] }, { kind: "thread", id: "t" }).update).toEqual([]);
  });
});

describe("ageFacts", () => {
  it("habits not seen for 14 days improve, and resolve after 28", () => {
    const now = new Date("2026-09-30T00:00:00Z");
    const changes = ageFacts(
      [
        fact({ id: "fresh", updatedAt: "2026-09-25T00:00:00Z" }),
        fact({ id: "quiet", updatedAt: "2026-09-10T00:00:00Z" }),
        fact({ id: "gone", status: "improving", updatedAt: "2026-08-30T00:00:00Z" }),
        fact({ id: "goal", kind: "goal", updatedAt: "2026-06-01T00:00:00Z" }),
      ],
      now,
    );
    expect(changes).toEqual([
      { id: "quiet", status: "improving" },
      { id: "gone", status: "resolved" },
    ]);
  });
});

describe("memoryBlock", () => {
  it("lists active and improving facts by kind for the prompt, never resolved ones", () => {
    const text = memoryBlock([
      fact(),
      fact({ id: "g", kind: "goal", text: "Amazon interview on Nov 20" }),
      fact({ id: "r", status: "resolved", text: "Old habit" }),
    ]);
    expect(text).toContain("Habits:\n- Shrinks the window before updating the answer");
    expect(text).toContain("Goals:\n- Amazon interview on Nov 20");
    expect(text).not.toContain("Old habit");
  });

  it("says so when there is nothing yet", () => {
    expect(memoryBlock([])).toBe("Nothing known about this user yet.");
  });
});
