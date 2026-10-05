import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type DomEnv, FakeEl, installDom } from "../../test-support/fake-dom";
import { addDot, type Dots, fillDots, fitCanvas, throttledLoop } from "./canvas";

let env: DomEnv;
beforeEach(() => {
  env = installDom();
});
afterEach(() => env.restore());

describe("fitCanvas", () => {
  it("sizes the bitmap by the pixel ratio and the box by CSS pixels, and draws in CSS pixels", () => {
    const canvas = new FakeEl("canvas");
    env.window.devicePixelRatio = 1.5;
    const dpr = fitCanvas(canvas as never, canvas.ctx as never, 400, 200);
    expect(dpr).toBe(1.5);
    expect([canvas.width, canvas.height]).toEqual([600, 300]);
    expect([canvas.style.width, canvas.style.height]).toEqual(["400px", "200px"]);
    expect(canvas.ctx.calls.at(-1)).toMatchObject({ name: "setTransform", args: [1.5, 0, 0, 1.5, 0, 0] });
  });

  it("stops at twice the pixels on a very dense screen, and treats a missing ratio as 1", () => {
    const canvas = new FakeEl("canvas");
    env.window.devicePixelRatio = 3;
    expect(fitCanvas(canvas as never, canvas.ctx as never, 100, 100)).toBe(2);
    env.window.devicePixelRatio = 0;
    expect(fitCanvas(canvas as never, canvas.ctx as never, 100, 100)).toBe(1);
  });
});

describe("dots", () => {
  it("groups dots by colour as x, y, radius triples", () => {
    const dots: Dots = new Map();
    addDot(dots, "#f00", 1, 2, 3);
    addDot(dots, "#0f0", 4, 5, 6);
    addDot(dots, "#f00", 7, 8, 9);
    expect(dots.get("#f00")).toEqual([1, 2, 3, 7, 8, 9]);
    expect(dots.get("#0f0")).toEqual([4, 5, 6]);
  });

  it("fills each colour once, and skips dots no bigger than the floor", () => {
    const canvas = new FakeEl("canvas");
    const dots: Dots = new Map();
    addDot(dots, "#f00", 10, 10, 2);
    addDot(dots, "#f00", 20, 20, 0.04);
    addDot(dots, "#0f0", 30, 30, 1);
    fillDots(canvas.ctx as never, dots, 0.05);
    const names = canvas.ctx.calls.map((c) => c.name);
    expect(names.filter((n) => n === "fill")).toHaveLength(2);
    expect(canvas.ctx.lastFrameDots()).toEqual([
      [10, 10, 2],
      [30, 30, 1],
    ]);
    expect(canvas.ctx.calls.filter((c) => c.name === "fill").map((c) => c.fillStyle)).toEqual(["#f00", "#0f0"]);
  });

  it("draws a dot of any size when there is no floor", () => {
    const canvas = new FakeEl("canvas");
    const dots: Dots = new Map();
    addDot(dots, "#fff", 1, 1, 0.01);
    fillDots(canvas.ctx as never, dots);
    expect(canvas.ctx.lastFrameDots()).toHaveLength(1);
  });
});

describe("throttledLoop", () => {
  it("draws at most once per frame interval", () => {
    const drawn: number[] = [];
    const loop = throttledLoop(
      (now) => drawn.push(now),
      () => true,
      33,
    );
    loop.run();
    env.frame(16); // first frame: last is 0 and now is 16, under the interval
    env.frame(16); // 32: still under
    env.frame(16); // 48: draws
    env.frame(16); // 64: only 16 after the last draw
    env.frame(16); // 80: 32 after the last draw, still under
    env.frame(16); // 96: draws
    expect(drawn).toEqual([48, 96]);
  });

  it("run does not queue a second frame while one is waiting", () => {
    const loop = throttledLoop(
      () => undefined,
      () => true,
    );
    loop.run();
    loop.run();
    expect(env.pending()).toBe(1);
  });

  it("lets go when it is no longer active, and starts again on run", () => {
    let active = true;
    const drawn: number[] = [];
    const loop = throttledLoop(
      (now) => drawn.push(now),
      () => active,
      10,
    );
    loop.run();
    env.frame(20);
    active = false;
    env.frame(20);
    expect(env.pending()).toBe(0);
    expect(drawn).toEqual([20]);
    active = true;
    loop.run();
    env.frame(20);
    expect(drawn).toEqual([20, 60]);
  });

  it("stop cancels the waiting frame", () => {
    const drawn: number[] = [];
    const loop = throttledLoop(
      (now) => drawn.push(now),
      () => true,
      0,
    );
    loop.run();
    loop.stop();
    expect(env.pending()).toBe(0);
    env.frame(50);
    expect(drawn).toEqual([]);
    loop.run();
    env.frame(50);
    expect(drawn).toHaveLength(1);
  });
});
