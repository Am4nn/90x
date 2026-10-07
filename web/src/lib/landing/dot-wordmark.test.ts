import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type DomEnv, FakeEl, installDom } from "../../test-support/fake-dom";
import { GLITCH_REACH_STEPS, mountWordmark, PHONE_DOT_STEP } from "./dot-wordmark";
import { PHONE_PARTICLE_SHARE, thin } from "./particle-math";
import { publishWordmark, stage } from "./stage";

const INK = "#E6E9EF";
const INK_X = "#67E8F9";
const GLITCH_RED = "#FF3D68";

let env: DomEnv;
let handle: { destroy(): void } | null = null;
beforeEach(() => {
  env = installDom();
  stage.lettersHidden = false;
  stage.overlay = false;
});
afterEach(() => {
  handle?.destroy();
  handle = null;
  publishWordmark(null);
  env.restore();
});

const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

/** A close section (wide by default) holding the canvas and its content column. */
function build(width = 1200, height = 600) {
  const section = new FakeEl("section");
  const content = new FakeEl("div", { "data-landing": "close-content" });
  const canvas = new FakeEl("canvas");
  section.clientWidth = width;
  section.clientHeight = height;
  content.clientWidth = width;
  content.box = { left: 0, top: 0, width, height };
  content.computed.paddingLeft = width < 760 ? "" : "48px";
  section.append(canvas, content);
  env.body.append(section);
  return { section, content, canvas };
}

async function mount(options: { still: boolean }, width?: number, height?: number) {
  const parts = build(width, height);
  handle = mountWordmark(parts.canvas as never, options);
  await flush();
  env.resize(parts.section);
  env.intersect(parts.section, true);
  return parts;
}

const lettersDrawn = (canvas: FakeEl) =>
  canvas.ctx.calls
    .slice(canvas.ctx.calls.map((c) => c.name).lastIndexOf("clearRect"))
    .filter((c) => c.name === "arc" && (c.fillStyle === INK || c.fillStyle === INK_X)).length;

const colorsBetween = async (still: boolean, from: number, to: number) => {
  const parts = await mount({ still });
  const seen = new Set<string>();
  env.now = from - 33;
  while (env.now < to) {
    env.frame(33);
    for (const color of parts.canvas.ctx.lastFrameColors()) seen.add(color);
  }
  handle?.destroy();
  env.restore();
  env = installDom();
  return seen;
};

describe("mountWordmark: the dots it publishes", () => {
  it("samples the letters off the font: a 90 dot and an x dot, side by side, on a grid 11px apart", async () => {
    await mount({ still: false });
    const mark = stage.mark!;
    expect(mark.step).toBe(11);
    expect(mark.fontSize).toBe(380); // the wide cap: 1104px of room would allow 613
    const nine = mark.dots.filter((d) => d.type === 1);
    const ex = mark.dots.filter((d) => d.type === 2);
    expect(nine.length).toBeGreaterThan(100);
    expect(ex.length).toBeGreaterThan(30);
    // "90" is two glyphs starting at the content's left edge (48), then the x after it.
    expect(Math.min(...nine.map((d) => d.x))).toBeLessThan(60);
    expect(Math.max(...nine.map((d) => d.x))).toBeLessThanOrEqual(48 + 456);
    expect(Math.min(...ex.map((d) => d.x))).toBeGreaterThanOrEqual(48 + 456);
    expect(mark.dots.some((d) => d.type === 0)).toBe(true);
    expect(mark.dots.every((d) => (d.x - 5.5) % 11 === 0 && (d.y - 5.5) % 11 === 0)).toBe(true);
  });

  it("gives every letter dot a particle on a wide screen, and background dots none", async () => {
    await mount({ still: false });
    const dots = stage.mark!.dots;
    expect(dots.filter((d) => d.type).every((d) => d.hasParticle)).toBe(true);
    expect(dots.filter((d) => !d.type).every((d) => !d.hasParticle)).toBe(true);
  });

  it("makes the grid finer, the letters at most 28% of the page's height, and cuts to a third of the particles on a phone", async () => {
    await mount({ still: false }, 500, 600);
    const mark = stage.mark!;
    expect(mark.step).toBe(7);
    expect(mark.fontSize).toBeCloseTo(600 * 0.28, 5); // the width (500) would allow more
    const letters = mark.dots.filter((d) => d.type);
    expect(letters.filter((d) => d.hasParticle)).toHaveLength(thin(letters.length, PHONE_PARTICLE_SHARE).filter(Boolean).length);
    expect(letters.filter((d) => d.hasParticle).length / letters.length).toBeCloseTo(1 / 3, 1);
  });

  it("keeps every letter dot on a phone under reduced motion, where there is no overlay to thin them for", async () => {
    await mount({ still: true }, 500);
    expect(stage.mark!.dots.filter((d) => d.type).every((d) => d.hasParticle)).toBe(true);
  });

  it("makes room at the top of the close section for the wordmark", async () => {
    const { section } = await mount({ still: false });
    expect(section.style.props["--landing-mark"]).toBe(`${Math.round(32 + 380 * 0.82)}px`);
  });

  it("publishes nothing for a section with no size", async () => {
    const parts = build(0, 0);
    handle = mountWordmark(parts.canvas as never, { still: false });
    await flush();
    env.resize(parts.section);
    expect(stage.mark).toBeNull();
  });
});

/** A phone's close page: the section, its content with the wordmark's placeholder `box` pixels from the top. */
function buildPhone(width: number, height: number, boxTop: number, boxHeight: number) {
  const parts = build(width, height);
  parts.section.box = { left: 0, top: 0, width, height };
  parts.content.computed.paddingLeft = "16px";
  const markBox = new FakeEl("div", { "data-landing": "mark-box" });
  markBox.box = { left: 16, top: boxTop, width: width - 32, height: boxHeight };
  parts.content.append(markBox);
  return parts;
}

describe("mountWordmark on a phone's close page", () => {
  it("is centred across the page and sits on its placeholder, not in the page's top-left", async () => {
    const parts = buildPhone(390, 844, 300, 170);
    handle = mountWordmark(parts.canvas as never, { still: false });
    await flush();
    env.resize(parts.section);
    env.intersect(parts.section, true);
    const mark = stage.mark!;
    const letters = mark.dots.filter((d) => d.type);
    const left = Math.min(...letters.map((d) => d.x));
    const right = Math.max(...letters.map((d) => d.x));
    expect(Math.abs(left - (390 - right))).toBeLessThanOrEqual(mark.step * 2);
    expect(Math.min(...letters.map((d) => d.y))).toBeGreaterThanOrEqual(300 - mark.step);
    expect(Math.max(...letters.map((d) => d.y))).toBeLessThanOrEqual(300 + 170 + mark.step * 2);
  });

  it("asks the page for room equal to the letters' height, so the group centres on it", async () => {
    const parts = buildPhone(390, 844, 300, 170);
    handle = mountWordmark(parts.canvas as never, { still: false });
    await flush();
    env.resize(parts.section);
    expect(parts.section.style.props["--landing-mark"]).toBe(`${Math.round(stage.mark!.fontSize * 0.84)}px`);
  });
});

describe("mountWordmark: the glitch's reach, published for the specs", () => {
  it("puts the reach in dot steps and the dot pitch on the canvas, the phone's pitch on a phone", async () => {
    const phone = buildPhone(390, 844, 300, 170);
    handle = mountWordmark(phone.canvas as never, { still: false });
    await flush();
    env.resize(phone.section);
    expect(phone.canvas.dataset.glitchLeft).toBe(String(GLITCH_REACH_STEPS.left));
    expect(phone.canvas.dataset.glitchRight).toBe(String(GLITCH_REACH_STEPS.right));
    expect(phone.canvas.dataset.step).toBe(String(PHONE_DOT_STEP));
  });
});

describe("mountWordmark: what it draws", () => {
  it("draws the letters, 90 in ink and the x in cyan, when the overlay is not running", async () => {
    const { canvas } = await mount({ still: true });
    const arcs = canvas.ctx.calls.filter((c) => c.name === "arc");
    expect(arcs.some((c) => c.fillStyle === INK)).toBe(true);
    expect(arcs.some((c) => c.fillStyle === INK_X)).toBe(true);
    expect(canvas.ctx.calls.some((c) => c.name === "drawImage")).toBe(true); // the dim field, painted once, underneath
  });

  it("draws the letters' dots at a third of the step", async () => {
    const { canvas } = await mount({ still: true });
    const r = canvas.ctx.calls.find((c) => c.name === "arc" && c.fillStyle === INK)!.args[2];
    expect(r).toBeCloseTo(11 * 0.34, 5);
  });

  it("leaves the letters to the overlay while it brings its particles in", async () => {
    const { canvas } = await mount({ still: false });
    expect(lettersDrawn(canvas)).toBeGreaterThan(0);
    stage.lettersHidden = true;
    env.frames(2, 33);
    expect(lettersDrawn(canvas)).toBe(0);
    stage.lettersHidden = false;
    env.frames(2, 33);
    expect(lettersDrawn(canvas)).toBeGreaterThan(0);
  });

  it("hands over the whole wordmark on a phone: every letter dot, the ones without a particle fading in", async () => {
    const { canvas } = await mount({ still: false }, 500);
    const letters = stage.mark!.dots.filter((d) => d.type);
    const withParticle = letters.filter((d) => d.hasParticle).length;
    expect(withParticle).toBeLessThan(letters.length);
    stage.overlay = true;
    stage.lettersHidden = true;
    env.frames(2, 33);
    expect(lettersDrawn(canvas)).toBe(0);
    stage.lettersHidden = false;
    env.frame(33);
    const radii = (frame: ReturnType<typeof canvas.ctx.lastFrameDots>) => frame.filter(([, , r]) => r > 0).length;
    expect(radii(canvas.ctx.lastFrameDots())).toBe(withParticle);
    env.frames(30, 33);
    expect(radii(canvas.ctx.lastFrameDots())).toBe(letters.length);
  });

  it("has no wandering stand-in cursor on a phone: nothing lights the field beside the letters", async () => {
    const { canvas } = await mount({ still: false }, 500);
    env.frames(60, 33);
    // Only the letters are lit: no field dots round a stand-in.
    expect(canvas.ctx.lastFrameDots()).toHaveLength(stage.mark?.dots.filter((d) => d.type).length ?? -1);
  });

  it("lights the field around the cursor, bigger the closer a dot is", async () => {
    const { canvas, section } = await mount({ still: false });
    section.box = { left: 0, top: 0, width: 1200, height: 600 };
    section.dispatch("pointermove", { clientX: 100, clientY: 500 });
    env.frame(33);
    const near = canvas.ctx
      .lastFrameDots()
      .map(([x, y, r]) => ({ d: Math.hypot(x - 100, y - 500), r }))
      .filter((dot) => dot.d < 150);
    expect(near.length).toBeGreaterThan(5);
    const closest = near.reduce((a, b) => (b.d < a.d ? b : a));
    const farthest = near.reduce((a, b) => (b.d > a.d ? b : a));
    expect(closest.r).toBeGreaterThan(farthest.r);
    expect(closest.r).toBeGreaterThan(1.5);
  });

  it("lets a wandering stand-in light the field when nobody is pointing", async () => {
    // Tall enough that the stand-in wanders below the letters, where the field is.
    const { canvas } = await mount({ still: false }, 1200, 1400);
    env.frame(33);
    const lit = canvas.ctx.lastFrameDots().filter(([, , r]) => r > 1 && r < 2.7);
    expect(lit.length).toBeGreaterThan(5);
  });

  it("has no cursor at all under reduced motion: no field is lit", async () => {
    const { canvas, section } = await mount({ still: true });
    expect(section.listenerCount("pointermove")).toBe(0);
    const bright = canvas.ctx.calls.filter((c) => c.name === "arc" && c.fillStyle !== INK && c.fillStyle !== INK_X);
    expect(bright).toHaveLength(0);
  });

  it("glitches on a 5.2 second rhythm, offset half of it from Ren, and never under reduced motion", async () => {
    // 2.6 s in is the start of the glitch, and a second is calm.
    expect((await colorsBetween(false, 2600, 2760)).has(GLITCH_RED)).toBe(true);
    expect((await colorsBetween(false, 1000, 1200)).has(GLITCH_RED)).toBe(false);
    expect((await colorsBetween(true, 2600, 2760)).has(GLITCH_RED)).toBe(false);
  });

  it("stops redrawing off screen", async () => {
    const { canvas, section } = await mount({ still: false });
    env.frames(5, 33);
    env.intersect(section, false);
    env.frame(33);
    expect(env.pending()).toBe(0);
    const calls = canvas.ctx.calls.length;
    env.frames(5, 33);
    expect(canvas.ctx.calls).toHaveLength(calls);
  });

  it("does not animate under reduced motion: the one frame the watcher asks for draws nothing", async () => {
    const { canvas } = await mount({ still: true });
    const calls = canvas.ctx.calls.length;
    env.frames(10, 33);
    expect(env.pending()).toBe(0);
    expect(canvas.ctx.calls).toHaveLength(calls);
  });
});

describe("mountWordmark: destroy", () => {
  it("lets go of everything and withdraws the dots it published", async () => {
    const { section } = await mount({ still: false });
    expect(stage.mark).not.toBeNull();
    expect(section.listenerCount("pointermove")).toBe(1);
    handle!.destroy();
    handle = null;
    expect(section.listenerCount("pointermove")).toBe(0);
    expect(env.liveObservers()).toBe(0);
    expect(env.pending()).toBe(0);
    expect(stage.mark).toBeNull();
  });

  it("never starts watching if it is destroyed before the font arrives", async () => {
    const parts = build();
    const mounted = mountWordmark(parts.canvas as never, { still: false });
    mounted.destroy();
    await flush();
    expect(env.liveObservers()).toBe(0);
    expect(env.pending()).toBe(0);
  });

  it("works with no content column: it takes the section's own box and a default gutter", async () => {
    const section = new FakeEl("section");
    const canvas = new FakeEl("canvas");
    section.clientWidth = 1200;
    section.clientHeight = 600;
    section.box = { left: 0, top: 0, width: 1200, height: 600 };
    section.append(canvas);
    env.body.append(section);
    handle = mountWordmark(canvas as never, { still: true });
    await flush();
    env.resize(section);
    expect(stage.mark!.dots.some((d) => d.type)).toBe(true);
  });
});
