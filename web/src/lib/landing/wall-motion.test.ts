import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type DomEnv, FakeEl, installDom } from "../../test-support/fake-dom";
import { columnShift, drift } from "./wall";
import { startWallMotion } from "./wall-motion";

let env: DomEnv;
beforeEach(() => {
  env = installDom();
});
afterEach(() => env.restore());

const px = (transform: string | undefined) => Number(/\(([-\d.e]+)px\)/.exec(transform ?? "")![1]);

const travelled = (s: string | undefined) => -Number(/-?[\d.]+/.exec(s ?? "")![0]);

/** A wall of `columns`, each holding two sets of cards; a set (and its gap) is 500px long, or 400px across when the column lies on its side. */
function buildWall(columns = 3, sideways = false) {
  const wall = new FakeEl("div");
  const cols = Array.from({ length: columns }, () => {
    const column = new FakeEl("div", { "data-wall-column": "" });
    const [first, second] = [new FakeEl(), new FakeEl()];
    second.offsetTop = 500;
    second.offsetLeft = 400;
    column.append(first, second);
    column.computed.flexDirection = sideways ? "row" : "column";
    return column;
  });
  wall.append(...cols);
  env.body.append(wall);
  return { wall, cols };
}

const shifts = (cols: FakeEl[]) => cols.map((c) => c.style.transform);

describe("startWallMotion", () => {
  it("does not move until the wall is on screen", () => {
    const { wall, cols } = buildWall();
    startWallMotion(wall as never);
    env.frames(10);
    expect(env.pending()).toBe(0);
    expect(shifts(cols)).toEqual([undefined, undefined, undefined]);
  });

  it("slides each column by its own amount, the second one the other way", () => {
    const { wall, cols } = buildWall();
    startWallMotion(wall as never);
    env.intersect(wall, true);
    env.frames(30, 33);
    // The first frame only sets the clock; the next 29 drift by 33ms each, with no page scroll to speed them up.
    const offset = drift(0, 0, 0) + 29 * 33 * 0.03;
    shifts(cols).forEach((transform, index) => {
      expect(transform).toMatch(/^translateY\(/);
      expect(px(transform)).toBeCloseTo(columnShift(index, offset, 500), 6);
    });
    expect(columnShift(1, offset, 500)).toBeGreaterThan(-500);
    expect(columnShift(0, offset, 500)).toBeLessThan(0);
  });

  it("slides along the row when the columns lie on their side (a phone)", () => {
    const { wall, cols } = buildWall(2, true);
    startWallMotion(wall as never);
    env.intersect(wall, true);
    env.frames(5, 33);
    for (const column of cols) expect(column.style.transform).toMatch(/^translateX\(/);
    // The second starts a whole set (400px) back: it is nowhere near its neighbour's position.
    expect(columnShift(1, 0, 400)).toBe(-400);
  });

  it("speeds up while the page scrolls", () => {
    const slow = buildWall(1);
    startWallMotion(slow.wall as never);
    env.intersect(slow.wall, true);
    env.frames(20, 33);
    const still = slow.cols[0]!.style.transform;

    env.restore();
    env = installDom();
    const fast = buildWall(1);
    startWallMotion(fast.wall as never);
    env.intersect(fast.wall, true);
    for (let i = 0; i < 20; i++) {
      env.window.scrollY += 60;
      env.frame(33);
    }
    const scrolled = fast.cols[0]!.style.transform;
    // Further along the same (negative, wrapping) path: compare how far each travelled.
    expect(travelled(scrolled)).toBeGreaterThan(travelled(still));
  });

  it("stops asking for frames when the wall leaves the screen, and picks up without a jump when it returns", () => {
    const { wall, cols } = buildWall(1);
    startWallMotion(wall as never);
    env.intersect(wall, true);
    env.frames(10, 33);
    const before = cols[0]!.style.transform;
    env.intersect(wall, false);
    env.frame(33);
    expect(env.pending()).toBe(0);
    env.now += 60_000; // a long time away
    env.intersect(wall, true);
    env.frame(33);
    // The first frame back only resets the clock: the minute spent away is not added to the drift.
    expect(cols[0]!.style.transform).toBe(before);
    env.frame(33);
    expect(cols[0]!.style.transform).not.toBe(before);
  });

  it("measures again when a column is resized", () => {
    const { wall, cols } = buildWall(1);
    startWallMotion(wall as never);
    env.intersect(wall, true);
    env.frames(5, 33);
    cols[0]!.children[1]!.offsetTop = 800;
    env.resize(cols[0]!);
    const offset = drift(0, 0, 0) + 4 * 33 * 0.03;
    expect(Number(/\(([-\d.e]+)px\)/.exec(cols[0]!.style.transform!)![1])).toBeCloseTo(columnShift(0, offset, 800), 6);
  });

  it("holds still, with no transform, for a column that has fewer than two sets", () => {
    const wall = new FakeEl();
    const column = new FakeEl("div", { "data-wall-column": "" });
    column.append(new FakeEl());
    wall.append(column);
    startWallMotion(wall as never);
    env.intersect(wall, true);
    env.frames(5, 33);
    expect(column.style.transform).toBe("translateY(0px)");
  });

  it("cleans up: no observers, no waiting frame, no transforms left behind", () => {
    const { wall, cols } = buildWall();
    const stop = startWallMotion(wall as never);
    env.intersect(wall, true);
    env.frames(5, 33);
    expect(env.liveObservers()).toBe(2);
    stop();
    expect(env.liveObservers()).toBe(0);
    expect(env.pending()).toBe(0);
    expect(shifts(cols)).toEqual([undefined, undefined, undefined]);
  });
});
