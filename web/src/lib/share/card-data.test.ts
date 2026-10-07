import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/tracker/dates";
import { buildCardModel } from "./card-data";

const start = "2026-09-15";
const dayDate = (n: number) => addDays(start, n - 1);
const rowsFor = (statuses: Record<number, string>, upTo: number) =>
  Array.from({ length: upTo }, (_, i) => ({ date: dayDate(i + 1), status: statuses[i + 1] ?? "done" }));

describe("buildCardModel", () => {
  it("matches the approved mock: day 23 of 90, 19 done and 2 revived", () => {
    // The mock's day 23: revived on days 3 and 14, partial on 9, missed on 6, the rest done.
    const rows = rowsFor({ 3: "revived", 14: "revived", 9: "partial", 6: "missed" }, 23);
    const m = buildCardModel({ startDate: start, lengthDays: 90, today: dayDate(23), rows });
    expect(m.dayNumber).toBe(23);
    expect(m.total).toBe(90);
    expect(m.done).toBe(19);
    expect(m.revived).toBe(2);
    expect(m.squares).toHaveLength(90);
    expect(m.squares[2]).toEqual({ status: "revived", today: false });
    expect(m.squares[5]?.status).toBe("missed");
    expect(m.squares[8]?.status).toBe("partial");
    expect(m.squares[22]).toEqual({ status: "done", today: true });
    expect(m.squares[23]).toEqual({ status: "future", today: false });
    expect(m.squares.filter((s) => s.today)).toHaveLength(1);
  });

  it("day one: no rows yet reads as day 1 with nothing done", () => {
    const m = buildCardModel({ startDate: start, lengthDays: 90, today: start, rows: [] });
    expect(m).toMatchObject({ dayNumber: 1, total: 90, done: 0, revived: 0 });
    expect(m.squares[0]).toEqual({ status: "pending", today: true });
    expect(m.squares[1]).toEqual({ status: "future", today: false });
  });

  it("day one with today's pending row is the same", () => {
    const m = buildCardModel({ startDate: start, lengthDays: 90, today: start, rows: [{ date: start, status: "pending" }] });
    expect(m.squares[0]).toEqual({ status: "pending", today: true });
    expect(m.done).toBe(0);
  });

  it("past days with no row are missed, not future (the app was not opened, the job has not closed them)", () => {
    const m = buildCardModel({ startDate: start, lengthDays: 90, today: dayDate(5), rows: [{ date: dayDate(1), status: "done" }] });
    expect(m.squares.slice(0, 5).map((s) => s.status)).toEqual(["done", "missed", "missed", "missed", "pending"]);
    expect(m.done).toBe(1);
  });

  it("a past row still pending is missed", () => {
    const m = buildCardModel({ startDate: start, lengthDays: 30, today: dayDate(3), rows: [{ date: dayDate(2), status: "pending" }] });
    expect(m.squares[1]?.status).toBe("missed");
  });

  it("keeps rest days as rest and never counts them as done", () => {
    const m = buildCardModel({ startDate: start, lengthDays: 30, today: dayDate(3), rows: rowsFor({ 2: "rest" }, 3) });
    expect(m.squares[1]?.status).toBe("rest");
    expect(m.done).toBe(2);
  });

  it("clamps the day number to the total once the campaign is over", () => {
    const rows = rowsFor({}, 30);
    const m = buildCardModel({ startDate: start, lengthDays: 30, today: dayDate(45), rows });
    expect(m.dayNumber).toBe(30);
    expect(m.total).toBe(30);
    expect(m.squares).toHaveLength(30);
    expect(m.squares.every((s) => !s.today)).toBe(true);
    expect(m.done).toBe(30);
  });

  it("clamps to day 1 when the campaign starts in the future", () => {
    const m = buildCardModel({ startDate: addDays(start, 3), lengthDays: 60, today: start, rows: [] });
    expect(m.dayNumber).toBe(1);
    expect(m.squares).toHaveLength(60);
    expect(m.squares.every((s) => s.status === "future" && !s.today)).toBe(true);
  });

  it("treats an unknown status as missed in the past and future ahead, never as done", () => {
    const m = buildCardModel({
      startDate: start,
      lengthDays: 30,
      today: dayDate(2),
      rows: [
        { date: dayDate(1), status: "bogus" },
        { date: dayDate(3), status: "bogus" },
      ],
    });
    expect(m.squares[0]?.status).toBe("missed");
    expect(m.squares[2]?.status).toBe("future");
    expect(m.done).toBe(0);
  });

  it("ignores rows outside the campaign window", () => {
    const m = buildCardModel({ startDate: start, lengthDays: 30, today: dayDate(2), rows: [{ date: addDays(start, -4), status: "done" }] });
    expect(m.done).toBe(0);
  });

  it("holds nothing but counts, the day number and the squares", () => {
    const m = buildCardModel({ startDate: start, lengthDays: 30, today: start, rows: [] });
    expect(Object.keys(m).toSorted()).toEqual(["dayNumber", "done", "revived", "squares", "total"]);
  });

  it.each([7, 30, 90, 120, 365])("keeps the true length of a %i-day campaign", (days) => {
    const m = buildCardModel({ startDate: start, lengthDays: days, today: dayDate(Math.min(days, 100)), rows: [] });
    expect(m.total).toBe(days);
    expect(m.squares).toHaveLength(days);
    expect(m.dayNumber).toBe(Math.min(days, 100));
  });

  it("clamps the day number to the total of a long campaign that is over", () => {
    const m = buildCardModel({ startDate: start, lengthDays: 120, today: dayDate(200), rows: [] });
    expect(m).toMatchObject({ dayNumber: 120, total: 120 });
  });

  it("guards the total to 1..365", () => {
    expect(buildCardModel({ startDate: start, lengthDays: 1000, today: start, rows: [] }).total).toBe(365);
    expect(buildCardModel({ startDate: start, lengthDays: 0, today: start, rows: [] }).total).toBe(1);
  });
});
