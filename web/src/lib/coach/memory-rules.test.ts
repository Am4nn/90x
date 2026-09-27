import { describe, expect, it } from "vitest";
import { ageFacts, type Fact, memoryBlock, planMerge } from "./memory-rules";

const fact = (over: Partial<Fact> = {}): Fact => ({
  id: "f1",
  kind: "habit",
  text: "Shrinks the window before updating the answer",
  status: "active",
  evidence: [{ kind: "checkin", id: "c1" }],
  lastSeenAt: "2026-09-01T00:00:00Z",
  expiresOn: null,
  ...over,
});
const now = new Date("2026-09-30T00:00:00Z");

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
      now,
    );
    expect(plan.insert.map((f) => f.text)).toEqual(["Amazon interview on Nov 20"]);
    expect(plan.insert[0]?.evidence).toEqual([{ kind: "thread", id: "t9" }]);
  });

  it("a fact seen again gets the new evidence, becomes active again and restarts its quiet clock", () => {
    const plan = planMerge([fact({ status: "improving" })], { facts: [], seen: ["f1"] }, { kind: "review", id: "r1" }, now);
    expect(plan.update).toEqual([
      {
        id: "f1",
        status: "active",
        evidence: [
          { kind: "checkin", id: "c1" },
          { kind: "review", id: "r1" },
        ],
        lastSeenAt: now.toISOString(),
      },
    ]);
  });

  it("ignores ids it doesn't know (the model can invent ids)", () => {
    const plan = planMerge(
      [fact()],
      { facts: [{ kind: "goal", text: "Google onsite Dec 5", replaces: "nope" }], seen: ["nope"], retired: ["nope"] },
      { kind: "thread", id: "t" },
      now,
    );
    expect(plan.update).toEqual([]);
    expect(plan.insert).toHaveLength(1);
  });

  it("a correction resolves the fact it replaces, so both never reach the prompt", () => {
    const goal = fact({ id: "g1", kind: "goal", text: "Amazon onsite on Nov 20", expiresOn: "2026-11-20" });
    const plan = planMerge(
      [goal],
      { facts: [{ kind: "goal", text: "Amazon onsite moved to Dec 5", replaces: "g1", expires: "2026-12-05" }], seen: ["g1"] },
      { kind: "thread", id: "t2" },
      now,
    );
    expect(plan.insert).toEqual([
      { kind: "goal", text: "Amazon onsite moved to Dec 5", evidence: [{ kind: "thread", id: "t2" }], expiresOn: "2026-12-05" },
    ]);
    expect(plan.update).toEqual([{ id: "g1", status: "resolved", evidence: goal.evidence }]);
  });

  it("retired facts resolve, even if also listed as seen", () => {
    const plan = planMerge([fact()], { facts: [], seen: ["f1"], retired: ["f1"] }, { kind: "thread", id: "t" }, now);
    expect(plan.update).toEqual([{ id: "f1", status: "resolved", evidence: fact().evidence }]);
  });

  it("never re-learns a fact the user deleted", () => {
    const plan = planMerge(
      [],
      { facts: [{ kind: "preference", text: "Likes full solutions up front." }], seen: [] },
      { kind: "thread", id: "t" },
      now,
      ["likes full solutions up front"],
    );
    expect(plan.insert).toEqual([]);
  });

  it("drops an expiry that isn't a real YYYY-MM-DD date", () => {
    const plan = planMerge(
      [],
      { facts: [{ kind: "goal", text: "Meta screen in November", expires: "November" }], seen: [] },
      { kind: "thread", id: "t" },
      now,
    );
    expect(plan.insert[0]?.expiresOn).toBeNull();
  });

  it("keeps only the latest 20 pieces of evidence", () => {
    const evidence = Array.from({ length: 20 }, (_, i) => ({ kind: "thread", id: `t${i}` }));
    const plan = planMerge([fact({ evidence })], { facts: [], seen: ["f1"] }, { kind: "review", id: "r" }, now);
    expect(plan.update[0]?.evidence).toHaveLength(20);
    expect(plan.update[0]?.evidence.at(-1)).toEqual({ kind: "review", id: "r" });
  });
});

describe("ageFacts", () => {
  it("habits not seen for 14 days improve, and resolve after 28", () => {
    const changes = ageFacts(
      [
        fact({ id: "fresh", lastSeenAt: "2026-09-25T00:00:00Z" }),
        fact({ id: "quiet", lastSeenAt: "2026-09-10T00:00:00Z" }),
        fact({ id: "gone", status: "improving", lastSeenAt: "2026-08-30T00:00:00Z" }),
        fact({ id: "goal", kind: "goal", lastSeenAt: "2026-06-01T00:00:00Z" }),
      ],
      now,
    );
    expect(changes).toEqual([
      { id: "quiet", status: "improving" },
      { id: "gone", status: "resolved" },
    ]);
  });

  it("counts quiet days from the last evidence, not from the last status change", () => {
    // Moved to improving recently, but last seen 30 days ago: resolves now, not 28 days after the status change.
    const f = fact({ status: "improving", lastSeenAt: "2026-08-31T00:00:00Z" });
    expect(ageFacts([f], now)).toEqual([{ id: "f1", status: "resolved" }]);
  });

  it("resolves any fact past its expiry date, and keeps one that expires today", () => {
    const changes = ageFacts(
      [
        fact({ id: "past", kind: "goal", expiresOn: "2026-09-29" }),
        fact({ id: "today", kind: "goal", expiresOn: "2026-09-30" }),
        fact({ id: "ctx", kind: "context", expiresOn: "2026-01-01" }),
      ],
      now,
    );
    expect(changes).toEqual([
      { id: "past", status: "resolved" },
      { id: "ctx", status: "resolved" },
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

  it("shows a fact's expiry date so Coach knows when it stops being true", () => {
    expect(memoryBlock([fact({ id: "g", kind: "goal", text: "Amazon onsite", expiresOn: "2026-11-20" })])).toContain(
      "- Amazon onsite (until 2026-11-20) [g]",
    );
  });

  it("says so when there is nothing yet", () => {
    expect(memoryBlock([])).toBe("Nothing known about this user yet.");
  });
});
