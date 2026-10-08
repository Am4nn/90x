import { describe, expect, it } from "vitest";
import { daySummary } from "./day-summary";
import { SLOT_MINUTES, type MissionType } from "./template";

const m = (slotType: MissionType, over: Partial<Parameters<typeof daySummary>[1][number]> = {}) => ({
  slotType,
  status: "open" as const,
  estMinutes: SLOT_MINUTES[slotType],
  isRevive: false,
  isExtra: false,
  ...over,
});

describe("daySummary", () => {
  it("counts the whole plan and its time on a fresh day", () => {
    const missions = [m("new_problem"), m("new_problem"), m("topic"), m("cards")];
    expect(daySummary("pending", missions)).toBe("2 problems, a topic and 10 cards · about 2h 5m");
  });

  it("uses singular words and drops the types a day has none of", () => {
    expect(daySummary("pending", [m("review"), m("cards")])).toBe("A review and 10 cards · about 40m");
    expect(daySummary("pending", [m("new_problem")])).toBe("A problem · about 40m");
    expect(daySummary("pending", [m("review"), m("review"), m("topic"), m("topic")])).toBe("2 reviews and 2 topics · about 1h 50m");
  });

  it("says what is left once something is finished", () => {
    const missions = [m("new_problem", { status: "done" }), m("topic", { status: "skipped" }), m("review"), m("cards")];
    expect(daySummary("pending", missions)).toBe("A review and 10 cards left · about 40m");
  });

  it("gives a finished day one short line", () => {
    const missions = [m("new_problem", { status: "done" }), m("cards", { status: "done" })];
    expect(daySummary("done", missions)).toBe("All done. The square is yours.");
  });

  it("calls a day with nothing countable a rest day", () => {
    expect(daySummary("rest", [])).toBe("A rest day");
    expect(daySummary("rest", [m("cards", { status: "coming_soon" })])).toBe("A rest day");
  });

  it("does not call a pending day a rest day when only its cards are still to come", () => {
    expect(daySummary("pending", [m("cards", { status: "coming_soon" })])).toBe("Nothing to do yet today");
    expect(daySummary("pending", [])).toBe("Nothing to do yet today");
  });

  it("leaves out cards that have not arrived, revives and extras", () => {
    const missions = [
      m("new_problem"),
      m("cards", { status: "coming_soon" }),
      m("review", { isRevive: true }),
      m("cards", { isExtra: true }),
    ];
    expect(daySummary("pending", missions)).toBe("A problem · about 40m");
  });

  it("uses the missions' own estimates, not the slot defaults", () => {
    expect(daySummary("pending", [m("new_problem", { estMinutes: 50 }), m("cards", { estMinutes: 10 })])).toBe(
      "A problem and 10 cards · about 1h",
    );
  });
});
