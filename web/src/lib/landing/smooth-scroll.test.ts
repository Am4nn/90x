import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type DomEnv, installDom } from "../../test-support/fake-dom";

const lenis = vi.hoisted(() => ({
  instances: [] as Array<{ options: unknown; scrollTo: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> }>,
}));
vi.mock("lenis", () => ({
  default: class {
    scrollTo = vi.fn();
    destroy = vi.fn();
    constructor(public options: unknown) {
      lenis.instances.push(this);
    }
  },
}));

let env: DomEnv;
beforeEach(() => {
  env = installDom();
  lenis.instances.length = 0;
  vi.resetModules();
});
afterEach(() => env.restore());

const load = () => import("./smooth-scroll");

describe("startSmoothScroll", () => {
  it("does not start for a visitor who asked for less motion", async () => {
    env.window.media["(prefers-reduced-motion: reduce)"] = true;
    env.window.media["(any-pointer: fine)"] = true;
    const { startSmoothScroll } = await load();
    const stop = await startSmoothScroll();
    expect(lenis.instances).toHaveLength(0);
    expect(stop()).toBeUndefined();
  });

  it("does not start on a touch screen, which scrolls natively", async () => {
    const { startSmoothScroll } = await load();
    await startSmoothScroll();
    expect(lenis.instances).toHaveLength(0);
  });

  it("starts Lenis with a mouse and stops it when told to", async () => {
    env.window.media["(any-pointer: fine)"] = true;
    const { startSmoothScroll } = await load();
    const stop = await startSmoothScroll();
    expect(lenis.instances).toHaveLength(1);
    expect(lenis.instances[0]!.options).toMatchObject({ autoRaf: true });
    stop();
    expect(lenis.instances[0]!.destroy).toHaveBeenCalledTimes(1);
  });
});

describe("glideTo", () => {
  it("glides for 3.2 seconds, slow at both ends, through Lenis while it runs", async () => {
    env.window.media["(any-pointer: fine)"] = true;
    const { glideTo, startSmoothScroll } = await load();
    const stop = await startSmoothScroll();
    glideTo(900);
    const [y, options] = lenis.instances[0]!.scrollTo.mock.calls[0] as [number, { duration: number; easing: (t: number) => number }];
    expect([y, options.duration]).toEqual([900, 3.2]);
    expect([options.easing(0), options.easing(0.5), options.easing(1)]).toEqual([0, 0.5, 1]);
    expect(options.easing(0.1)).toBeLessThan(0.1);
    stop();
    glideTo(500);
    expect(lenis.instances[0]!.scrollTo).toHaveBeenCalledTimes(1);
    expect(env.window.scrollTo).toHaveBeenCalledWith({ top: 500, behavior: "smooth" });
  });

  it("jumps rather than animates under reduced motion when Lenis is not running", async () => {
    env.window.media["(prefers-reduced-motion: reduce)"] = true;
    const { glideTo } = await load();
    glideTo(300);
    expect(env.window.scrollTo).toHaveBeenCalledWith({ top: 300, behavior: "auto" });
  });
});
