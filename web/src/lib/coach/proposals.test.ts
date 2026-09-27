import { describe, expect, it } from "vitest";
import { proposeTemplate } from "@/lib/tracker/template";
import { applyTemplateChanges, changeLine, parseProposal, templateDiff } from "./proposals";

const card = "7a1c1b0e-1f2d-4c3b-9a8e-0f1e2d3c4b5a";

describe("parseProposal", () => {
  it("reads a tool output with a valid payload", () => {
    const out = parseProposal({ proposal: { type: "queue_cards", summary: "Add 1 card", payload: { cardIds: [card] } } });
    expect(out?.proposal.type).toBe("queue_cards");
    expect(out?.status).toBeUndefined();
  });

  it("keeps a recorded decision", () => {
    const out = parseProposal({
      proposal: { type: "start_mock", summary: "Design mock", payload: { type: "design", topic: "Rate limiter" } },
      status: "dismissed",
    });
    expect(out?.status).toBe("dismissed");
  });

  it("rejects payloads that don't match their type", () => {
    expect(parseProposal({ proposal: { type: "queue_cards", summary: "x", payload: { cardIds: ["not-a-uuid"] } } })).toBeNull();
    expect(parseProposal({ proposal: { type: "queue_cards", summary: "x", payload: { cardIds: [] } } })).toBeNull();
    expect(
      parseProposal({
        proposal: { type: "add_mission", summary: "x", payload: { slotType: "cards", ref: "c", title: "t", estMinutes: 15 } },
      }),
    ).toBeNull();
    expect(
      parseProposal({ proposal: { type: "save_memory", summary: "x", payload: { id: null, kind: "secret", text: "hello" } } }),
    ).toBeNull();
    expect(parseProposal({ proposal: { type: "drop_tables", summary: "x", payload: {} } })).toBeNull();
    expect(parseProposal({ error: "nope" })).toBeNull();
  });

  it("reads the lesson's queue_ladder proposal", () => {
    const out = parseProposal({
      proposal: { type: "queue_ladder", summary: "Add CT 1 to today", payload: { slugs: ["two-sum", "3sum"] } },
    });
    expect(out?.proposal.type).toBe("queue_ladder");
    expect(parseProposal({ proposal: { type: "queue_ladder", summary: "x", payload: { slugs: ["../etc"] } } })).toBeNull();
    expect(parseProposal({ proposal: { type: "queue_ladder", summary: "x", payload: { slugs: ["a", "b", "c", "d"] } } })).toBeNull();
  });

  it("refuses extra payload fields, so nothing unchecked rides along", () => {
    expect(
      parseProposal({ proposal: { type: "queue_cards", summary: "x", payload: { cardIds: [card], userId: "someone-else" } } }),
    ).toBeNull();
  });
});

describe("template changes", () => {
  const current = proposeTemplate(120, 180);

  it("diffs against the current plan and drops no-op changes", () => {
    const monday = current[1].new_problem;
    expect(
      templateDiff(current, [
        { weekday: 1, slot: "new_problem", to: monday + 1 },
        { weekday: 2, slot: "review", to: current[2].review },
      ]),
    ).toEqual([{ weekday: 1, slot: "new_problem", from: monday, to: monday + 1 }]);
  });

  it("applies changes and validates the result", () => {
    const result = applyTemplateChanges(current, [{ weekday: 0, slot: "cards", to: 3 }]);
    expect("templates" in result && result.templates[0].cards).toBe(3);
    expect(current[0].cards).not.toBe(3);
  });

  it("refuses a day left with nothing that counts", () => {
    const result = applyTemplateChanges(current, [
      { weekday: 3, slot: "new_problem", to: 0 },
      { weekday: 3, slot: "review", to: 0 },
      { weekday: 3, slot: "topic", to: 0 },
    ]);
    expect(result).toEqual({ error: "Each day needs a problem, review or topic." });
  });

  it("describes a change in one line", () => {
    expect(changeLine({ weekday: 1, slot: "new_problem", from: 1, to: 2 })).toBe("Mon · New problems 1 → 2");
  });
});

describe("end_mock", () => {
  it("needs a mock id", () => {
    expect(parseProposal({ proposal: { type: "end_mock", summary: "End", payload: { mockId: card } } })?.proposal.type).toBe("end_mock");
    expect(parseProposal({ proposal: { type: "end_mock", summary: "End", payload: { mockId: null } } })).toBeNull();
  });
});
