import { describe, expect, it } from "vitest";
import { DEMO_ANSWER } from "./demo";
import { phoneDemoView, restartTick, STEP_LABELS, STEP_MS } from "./demo-timer";
import { FIRST_CORRECT_DAYS } from "./review-days";

describe("the phone demo's step machine", () => {
  it("has three steps of four seconds, named as the mock names them", () => {
    expect(STEP_MS).toBe(4000);
    expect([...STEP_LABELS]).toEqual(["You tap an answer", "Ren marks it", "Next review booked"]);
  });

  it("walks tap, mark, book on three ticks, and the first cycle is the right answer", () => {
    const v = [0, 1, 2].map((tick) => phoneDemoView(tick, false));
    expect(v.map((x) => x.step)).toEqual([0, 1, 2]);
    expect(v.every((x) => x.outcome === "right" && x.tapped === DEMO_ANSWER)).toBe(true);
    expect(v.map((x) => [x.marked, x.booked])).toEqual([
      [false, false],
      [true, false],
      [true, true],
    ]);
  });

  it("alternates: the next cycle taps a wrong answer, then the right one again, forever", () => {
    expect([3, 4, 5].map((t) => phoneDemoView(t, false).outcome)).toEqual(["wrong", "wrong", "wrong"]);
    expect(phoneDemoView(3, false).tapped).not.toBe(DEMO_ANSWER);
    expect(phoneDemoView(6, false)).toEqual(phoneDemoView(0, false));
    expect(phoneDemoView(300, false).outcome).toBe("right");
    expect(phoneDemoView(303, false).outcome).toBe("wrong");
  });

  it("fills the progress strip: finished segments done, the current one active, the rest waiting", () => {
    expect(phoneDemoView(0, false).segments).toEqual(["active", "todo", "todo"]);
    expect(phoneDemoView(1, false).segments).toEqual(["done", "active", "todo"]);
    expect(phoneDemoView(2, false).segments).toEqual(["done", "done", "active"]);
  });

  it("starts every segment empty until the demo runs, so nothing is filled before it begins", () => {
    expect(phoneDemoView(0, false, false).segments).toEqual(["todo", "todo", "todo"]);
    expect(phoneDemoView(0, true, false).segments).toEqual(["done", "done", "done"]);
  });

  it("says what the scheduler books, from the same numbers the try page uses", () => {
    expect(phoneDemoView(1, false).verdict).toBe(`Correct · in ${FIRST_CORRECT_DAYS} days`);
    expect(phoneDemoView(2, false).booking).toBe(`Next review booked · day ${FIRST_CORRECT_DAYS}`);
    expect(phoneDemoView(2, false).bookedSquare).toBe(FIRST_CORRECT_DAYS);
    expect(phoneDemoView(4, false).verdict).toBe("Not quite · back tomorrow");
    expect(phoneDemoView(5, false).booking).toBe("Next review booked · tomorrow");
    expect(phoneDemoView(5, false).bookedSquare).toBe(1);
    expect(phoneDemoView(0, false).bookedSquare).toBeNull();
  });

  it("is the finished, right state under reduced motion, whatever the tick", () => {
    for (const tick of [0, 1, 4, 100]) {
      const v = phoneDemoView(tick, true);
      expect(v).toMatchObject({
        step: 2,
        outcome: "right",
        marked: true,
        booked: true,
        tapped: DEMO_ANSWER,
      });
      expect(v.segments).toEqual(["done", "done", "done"]);
    }
  });

  it("starts a visitor who scrolls in at the beginning of a right-answer cycle", () => {
    expect(restartTick(0)).toBe(0);
    expect(restartTick(1)).toBe(6);
    expect(restartTick(4)).toBe(6);
    expect(restartTick(6)).toBe(6);
    expect(restartTick(7)).toBe(12);
    expect(phoneDemoView(restartTick(5), false)).toMatchObject({
      step: 0,
      outcome: "right",
    });
  });
});
