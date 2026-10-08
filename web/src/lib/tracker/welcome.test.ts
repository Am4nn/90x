import { describe, expect, it } from "vitest";
import { proposeTemplate } from "./template";
import { dayBar, welcomeDay } from "./welcome";

describe("dayBar", () => {
  it("draws a two-hour day in fill order, with the spare minutes last", () => {
    expect(dayBar({ review: 1, new_problem: 1, topic: 1 }, 120)).toEqual([
      { key: "review", minutes: 25 },
      { key: "new_problem", minutes: 40 },
      { key: "topic", minutes: 30 },
      { key: "cards", minutes: 15 },
      { key: "free", minutes: 10 },
    ]);
  });

  it("leaves out a type the day has none of, and multiplies one it has several of", () => {
    expect(dayBar({ review: 0, new_problem: 2, topic: 0 }, 95)).toEqual([
      { key: "new_problem", minutes: 80 },
      { key: "cards", minutes: 15 },
    ]);
  });

  it("has no spare part without a budget or when the day uses all of it", () => {
    expect(dayBar({ review: 0, new_problem: 1, topic: 0 }, null).map((p) => p.key)).toEqual(["new_problem", "cards"]);
    expect(dayBar({ review: 0, new_problem: 1, topic: 0 }, 40).map((p) => p.key)).toEqual(["new_problem", "cards"]);
  });
});

describe("welcomeDay", () => {
  const templates = proposeTemplate(120, 60, "some_practice");

  it("uses the weekday budget and template on a weekday", () => {
    // 2026-10-08 is a Thursday.
    const day = welcomeDay({ templates, weekdayMinutes: 120, weekendMinutes: 60 }, "2026-10-08");
    expect(day.budget).toBe(120);
    expect(day.bar.reduce((sum, p) => sum + p.minutes, 0)).toBe(120);
    expect(day.everyDay).toBe(false);
  });

  it("uses the weekend budget and template on a Saturday", () => {
    const day = welcomeDay({ templates, weekdayMinutes: 120, weekendMinutes: 60 }, "2026-10-10");
    expect(day.budget).toBe(60);
    expect(day.bar.reduce((sum, p) => sum + p.minutes, 0)).toBe(60);
  });

  it("says the budget is the same every day when Set up gave one time", () => {
    expect(welcomeDay({ templates, weekdayMinutes: 120, weekendMinutes: 120 }, "2026-10-08").everyDay).toBe(true);
  });
});
