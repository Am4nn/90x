import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type DomEnv, FakeEl, installDom, pointer } from "../../test-support/fake-dom";
import { REN_COLORS, REN_GLITCH, renGrid } from "./ren";
import { mountRen, type RenHandle, type RenOptions } from "./ren-renderer";
import { publishRen, stage } from "./stage";

let env: DomEnv;
let handle: RenHandle | null = null;
beforeEach(() => {
  env = installDom();
  stage.overlay = false;
});
afterEach(() => {
  handle?.destroy();
  handle = null;
  env.restore();
});

/** The font promise and its then, which the mount waits on. */
const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

/** hero > box (600 by 400) > canvas, with the sign-in button in the hero. */
function build() {
  const hero = new FakeEl("section", { "data-landing": "hero" });
  const box = new FakeEl("div");
  const canvas = new FakeEl("canvas");
  const cta = new FakeEl("a", { "data-cta": "hero" });
  box.clientWidth = 600;
  box.clientHeight = 400;
  box.box = { left: 100, top: 50, width: 600, height: 400 };
  box.append(canvas);
  hero.append(box, cta);
  env.body.append(hero);
  return { hero, box, canvas, cta };
}

async function mount(options: RenOptions) {
  const parts = build();
  handle = mountRen(parts.canvas as never, options);
  await flush();
  return parts;
}

/** The sprite rows drawn in the last frame: drawImage's source y of each cell. */
const spriteRows = (canvas: FakeEl) =>
  canvas.ctx.calls
    .slice(canvas.ctx.calls.map((c) => c.name).lastIndexOf("clearRect"))
    .filter((c) => c.name === "drawImage")
    .map((c) => c.args[2]!);

const run = async (withPointer: boolean) => {
  const parts = await mount({ still: false });
  if (withPointer) parts.hero.dispatch("pointermove", { clientX: 690, clientY: 250 });
  env.frames(50, 33);
  const rows = parts.canvas.ctx.calls.filter((c) => c.name === "drawImage").slice(-400);
  const shot = JSON.stringify(rows.map((c) => c.args.slice(1)));
  handle?.destroy();
  env.restore();
  env = installDom();
  return shot;
};

describe("mountRen", () => {
  it("does not follow the pointer on a touch screen: no listener, and the same sway as with no pointer", async () => {
    env.window.media["(pointer: coarse)"] = true;
    const touch = await mount({ still: false });
    expect(touch.hero.listenerCount("pointermove")).toBe(0);
    handle?.destroy();
    env.restore();
    env = installDom();
    const baseline = await run(false);
    env.window.media["(hover: none)"] = true;
    expect(await run(true)).toBe(baseline);
  });

  it("still follows a mouse", async () => {
    const parts = await mount({ still: false });
    expect(parts.hero.listenerCount("pointermove")).toBe(1);
  });

  it("draws one still frame under reduced motion, and no more", async () => {
    const { canvas } = await mount({ still: true });
    const calls = canvas.ctx.calls;
    expect(calls.filter((c) => c.name === "clearRect")).toHaveLength(1);
    expect(calls.filter((c) => c.name === "drawImage").length).toBeGreaterThan(300);
    env.frames(30, 33);
    expect(env.pending()).toBe(0);
    expect(canvas.ctx.calls).toHaveLength(calls.length);
  });

  it("publishes where its cells are, so the overlay can start the particles there", async () => {
    await mount({ still: true });
    expect(stage.ren).toMatchObject({ width: 600, height: 400, grid: renGrid(600, 400) });
  });

  it("sizes the canvas to its box and marks itself ready when it is not waiting for the overlay", async () => {
    const { canvas } = await mount({ still: true });
    expect([canvas.style.width, canvas.style.height]).toEqual(["600px", "400px"]);
    expect(canvas.dataset.ready).toBe("true");
  });

  it("draws again when the box changes size", async () => {
    const { canvas, box } = await mount({ still: true });
    box.clientWidth = 300;
    box.clientHeight = 200;
    env.resize(box);
    expect(canvas.ctx.calls.filter((c) => c.name === "clearRect")).toHaveLength(2);
    expect(stage.ren).toMatchObject({ width: 300, height: 200 });
  });

  it("does nothing until the font is loaded, and not at all for a box with no size", async () => {
    const parts = build();
    parts.box.clientWidth = 0;
    handle = mountRen(parts.canvas as never, { still: true });
    expect(parts.canvas.ctx.calls).toHaveLength(0);
    await flush();
    expect(parts.canvas.ctx.calls).toHaveLength(0);
    expect(stage.ren).toBeNull();
  });

  it("leaves the pointer alone under reduced motion", async () => {
    const { hero } = await mount({ still: true });
    expect(hero.listenerCount("pointermove")).toBe(0);
    expect(hero.listenerCount("pointerover")).toBe(0);
  });

  it("is not ready while it waits for the overlay, and shows itself after six seconds if the overlay never comes", async () => {
    const { canvas } = await mount({ still: true, staged: true });
    expect(canvas.dataset.ready).toBeUndefined();
    env.timers(5999);
    expect(canvas.dataset.ready).toBeUndefined();
    env.timers(1);
    expect(canvas.dataset.ready).toBe("true");
  });

  it("stays hidden past six seconds when the overlay is running and owns its opacity", async () => {
    stage.overlay = true;
    const { canvas } = await mount({ still: true, staged: true });
    env.timers(7000);
    expect(canvas.dataset.ready).toBeUndefined();
  });

  it("animates at about 30 frames a second while it is on screen", async () => {
    const { canvas } = await mount({ still: false });
    const drawn = () => canvas.ctx.calls.filter((c) => c.name === "clearRect").length;
    const first = drawn(); // the size() draw
    env.frames(60, 16.7); // a second at 60Hz
    const frames = drawn() - first;
    expect(frames).toBeGreaterThanOrEqual(28);
    expect(frames).toBeLessThanOrEqual(32);
  });

  it("stops redrawing while it is off screen and resumes when it is back", async () => {
    const { canvas, box } = await mount({ still: false });
    env.frames(10, 33);
    env.intersect(box, false);
    env.frame(33);
    expect(env.pending()).toBe(0);
    const calls = canvas.ctx.calls.length;
    env.frames(10, 33);
    expect(canvas.ctx.calls).toHaveLength(calls);
    env.intersect(box, true);
    env.frames(3, 33);
    expect(canvas.ctx.calls.length).toBeGreaterThan(calls);
  });

  it("turns to follow the pointer, and the picture changes with it", async () => {
    // The same clock, with and without the pointer at the far right: different faces.
    expect(await run(true)).not.toEqual(await run(false));
  });

  it("glitches while a real mouse is over the sign-in button, and not for a finger", async () => {
    const glitchRow = (REN_COLORS.length - 1) * Math.ceil(renGrid(600, 400).ch);
    expect(REN_COLORS[REN_COLORS.length - 1]).toBe(REN_GLITCH);

    const mouse = await mount({ still: false });
    mouse.hero.dispatch("pointerover", pointer(mouse.cta));
    // 1.32 s in: inside the 70 ms the hover adds to every 1.3 s.
    env.frames(40, 33);
    expect(spriteRows(mouse.canvas)).toContain(glitchRow);
    mouse.hero.dispatch("pointerout", pointer(mouse.cta));
    handle?.destroy();
    env.restore();

    env = installDom();
    const touch = await mount({ still: false });
    touch.hero.dispatch("pointerover", pointer(touch.cta, { pointerType: "touch" }));
    env.frames(40, 33);
    expect(spriteRows(touch.canvas)).not.toContain(glitchRow);
  });

  it("ignores the pointer over anything that is not the sign-in button", async () => {
    const { hero, canvas } = await mount({ still: false });
    hero.dispatch("pointerover", pointer(new FakeEl("p")));
    env.frames(40, 33);
    expect(spriteRows(canvas)).not.toContain((REN_COLORS.length - 1) * Math.ceil(renGrid(600, 400).ch));
  });

  it("cleans up: listeners, observers, timers and the geometry it published", async () => {
    const { hero } = await mount({ still: false, staged: true });
    expect(hero.listenerCount("pointermove")).toBe(1);
    publishRen({ grid: renGrid(1, 1), width: 1, height: 1 });
    handle!.destroy();
    handle = null;
    expect(hero.listenerCount("pointermove")).toBe(0);
    expect(hero.listenerCount("pointerover")).toBe(0);
    expect(hero.listenerCount("pointerout")).toBe(0);
    expect(env.liveObservers()).toBe(0);
    expect(env.pending()).toBe(0);
    expect(stage.ren).toBeNull();
  });

  it("does not draw if it is destroyed before the font arrives", async () => {
    const parts = build();
    const mounted = mountRen(parts.canvas as never, { still: false });
    mounted.destroy();
    await flush();
    expect(parts.canvas.ctx.calls).toHaveLength(0);
    expect(env.pending()).toBe(0);
  });

  it("falls back to its own box for pointer events when it is not inside the hero", async () => {
    const box = new FakeEl("div");
    const canvas = new FakeEl("canvas");
    box.clientWidth = 200;
    box.clientHeight = 200;
    box.append(canvas);
    env.body.append(box);
    handle = mountRen(canvas as never, { still: false });
    await flush();
    expect(box.listenerCount("pointermove")).toBe(1);
  });
});
