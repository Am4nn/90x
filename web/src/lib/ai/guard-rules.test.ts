import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "@/lib/settings-rules";
import { alertsFor, alertText, decide, level } from "./guard-rules";

const S = DEFAULT_SETTINGS; // daily $3, monthly $30, per person $0.25, hard stop on
const none = { day: 0, month: 0, userDay: 0, lifetime: 0 };

describe("level", () => {
  it("steps at 80%, 100% and 200% of the cap", () => {
    expect(level(2.39, 3)).toBe("ok");
    expect(level(2.4, 3)).toBe("warn");
    expect(level(3, 3)).toBe("over");
    expect(level(5.99, 3)).toBe("over");
    expect(level(6, 3)).toBe("stop");
  });
});

describe("decide", () => {
  it("allows normal use", () => {
    expect(decide(S, none)).toEqual({ allowed: true, degrade: false });
  });

  it("keeps running past a cap but moves the Coach to the lighter model", () => {
    expect(decide(S, { ...none, day: 3.5 })).toEqual({ allowed: true, degrade: true });
    expect(decide(S, { ...none, month: 31 })).toEqual({ allowed: true, degrade: true });
  });

  it("stops at twice the daily or the monthly cap", () => {
    expect(decide(S, { ...none, day: 6 })).toEqual({ allowed: false, reason: "stopped" });
    expect(decide(S, { ...none, month: 60 })).toEqual({ allowed: false, reason: "stopped" });
  });

  it("keeps running past twice the cap when the hard stop is off", () => {
    expect(decide({ ...S, aiHardStop: false }, { ...none, day: 50, month: 500 })).toEqual({ allowed: true, degrade: true });
  });

  it("pauses everything when paused, whatever the spend and the hard-stop switch", () => {
    expect(decide({ ...S, aiPaused: true, aiHardStop: false }, none)).toEqual({ allowed: false, reason: "paused" });
  });

  it("holds one person to their daily cap even with the hard stop off", () => {
    expect(decide({ ...S, aiHardStop: false }, { ...none, userDay: 0.25 })).toEqual({ allowed: false, reason: "user-cap" });
    expect(decide(S, { ...none, userDay: 0.24 })).toEqual({ allowed: true, degrade: false });
  });
});

describe("alertsFor", () => {
  it("says nothing below 80%", () => {
    expect(alertsFor(S, { day: 2, month: 10, lifetime: 20 })).toEqual([]);
  });

  it("warns once a period reaches 80%, and names only the highest level", () => {
    expect(alertsFor(S, { day: 2.4, month: 10, lifetime: 20 })).toEqual([{ period: "day", level: "warn", spent: 2.4, cap: 3 }]);
    expect(alertsFor(S, { day: 6.5, month: 10, lifetime: 20 })).toEqual([{ period: "day", level: "stop", spent: 6.5, cap: 3 }]);
  });

  it("adds no new message at 100%: it is still the 80% warning", () => {
    expect(alertsFor(S, { day: 3.2, month: 0, lifetime: 20 })).toEqual([{ period: "day", level: "warn", spent: 3.2, cap: 3 }]);
  });

  it("reports both periods when both are past the line", () => {
    expect(alertsFor(S, { day: 2.5, month: 25, lifetime: 20 }).map((a) => a.period)).toEqual(["day", "month"]);
  });
});

describe("the lifetime ceiling", () => {
  it("stops AI at 100% whatever the hard-stop switch says", () => {
    expect(decide(S, { ...none, lifetime: 105 })).toEqual({ allowed: false, reason: "lifetime" });
    expect(decide({ ...S, aiHardStop: false }, { ...none, lifetime: 105 })).toEqual({ allowed: false, reason: "lifetime" });
    expect(decide(S, { ...none, lifetime: 104.99 })).toEqual({ allowed: true, degrade: false });
  });

  it("warns from 80% and stops at 100%, with its own wording", () => {
    expect(alertsFor(S, { day: 0, month: 0, lifetime: 84 })).toEqual([{ period: "lifetime", level: "warn", spent: 84, cap: 105 }]);
    const stop = alertsFor(S, { day: 0, month: 0, lifetime: 110 });
    expect(stop).toEqual([{ period: "lifetime", level: "stop", spent: 110, cap: 105 }]);
    expect(alertText(stop[0]!, false).subject).toContain("lifetime cap reached");
  });
});

describe("alertText", () => {
  it("says nothing has stopped for a warning", () => {
    const t = alertText({ period: "day", level: "warn", spent: 2.5, cap: 3 }, true);
    expect(t.subject).toContain("83%");
    expect(t.body).toContain("Nothing has stopped");
  });

  it("says what stopped, or that nothing did when the hard stop is off", () => {
    const stop = { period: "month", level: "stop", spent: 61, cap: 30 } as const;
    expect(alertText(stop, true).body).toContain("have stopped");
    expect(alertText(stop, false).body).toContain("still running");
  });
});
