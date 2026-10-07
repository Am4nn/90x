import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  breath,
  ease,
  eyeOpenness,
  glitchFrame,
  glitching,
  glitchGlyph,
  glitchShift,
  RAMP,
  REDS,
  REN_CHARS,
  REN_COLORS,
  REN_EYE,
  REN_GLITCH,
  REN_SHADOW,
  type RenCell,
  renGrid,
  renSources,
  renView,
  shadeCell,
  targetPose,
  tracksPointer,
} from "./ren";

const cell = (x: number, y: number, view = renView(0, 0, 1)): (RenCell & { drawn: true }) | { drawn: false } => {
  const out: RenCell = { char: "", color: "" };
  return shadeCell(x, y, view, out) ? { ...out, drawn: true } : { drawn: false };
};

describe("renGrid", () => {
  it("is 60 columns across, each cell 1.7 times taller than wide", () => {
    const grid = renGrid(600, 600);
    expect(grid.cols).toBe(60);
    expect(grid.cw).toBe(10);
    expect(grid.ch).toBe(17);
    expect(grid.rows).toBe(35);
    expect(grid.radius).toBe(240);
  });

  it("drops to 44 columns below 320px and sizes the sphere by the shorter side", () => {
    expect(renGrid(300, 300).cols).toBe(44);
    expect(renGrid(320, 320).cols).toBe(60);
    expect(renGrid(600, 400).radius).toBe(160);
  });
});

describe("the atlas inputs", () => {
  it("has every colour and character the picture can use, so no cell is left undrawn", () => {
    expect(REN_COLORS).toEqual([...REDS, REN_EYE, REN_SHADOW, REN_GLITCH]);
    for (const char of [...RAMP.slice(1), "@", "=", "-", ..."/<>"]) expect(REN_CHARS).toContain(char);
  });

  it("repeats the two token colours it shares with the theme exactly", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    const token = (name: string) => new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, "i").exec(css)?.[1]?.toLowerCase();
    expect(REN_SHADOW.toLowerCase()).toBe(token("x-line"));
    expect(REN_GLITCH.toLowerCase()).toBe(token("x-accent"));
  });
});

describe("shadeCell", () => {
  it("leaves the corners empty", () => {
    expect(cell(1.2, 1.2).drawn).toBe(false);
    expect(cell(-1.4, -0.2).drawn).toBe(false);
  });

  it("is brightest towards the light (upper left) and darkest on the opposite limb", () => {
    const lit = cell(-0.45, -0.5);
    const dark = cell(0.7, 0.6);
    expect(lit.drawn && dark.drawn).toBe(true);
    if (!lit.drawn || !dark.drawn) return;
    expect(REDS.indexOf(lit.color as (typeof REDS)[number])).toBeGreaterThan(REDS.indexOf(dark.color as (typeof REDS)[number]));
    expect(RAMP.indexOf(lit.char)).toBeGreaterThan(RAMP.indexOf(dark.char));
  });

  it("draws the two eyes white, an @ each, and shuts them in a blink", () => {
    for (const x of [-0.3, 0.3]) {
      const open = cell(x, -0.12);
      expect(open).toMatchObject({ drawn: true, char: "@", color: REN_EYE });
    }
    // Between the eyes there is no eye.
    expect(cell(0, -0.12)).not.toMatchObject({ color: REN_EYE });
    // Shut (8% of its height) the eye no longer reaches a cell a little above its centre.
    expect(cell(0.3, -0.12 - 0.1, renView(0, 0, 1))).toMatchObject({ color: REN_EYE });
    expect(cell(0.3, -0.12 - 0.1, renView(0, 0, 0))).not.toMatchObject({ color: REN_EYE });
  });

  it("puts an elliptical shadow under the sphere: = in the core, - at the rim", () => {
    expect(cell(0, 1.08)).toMatchObject({ drawn: true, char: "=", color: REN_SHADOW });
    expect(cell(0.9, 1.08)).toMatchObject({ drawn: true, char: "-", color: REN_SHADOW });
    expect(cell(1.3, 1.08).drawn).toBe(false);
    expect(cell(0, 1.3).drawn).toBe(false);
  });
});

describe("eyeOpenness", () => {
  it("is open except for 200ms at the end of every 4.2s", () => {
    expect(eyeOpenness(0)).toBe(1);
    expect(eyeOpenness(4000)).toBe(1);
    expect(eyeOpenness(4100)).toBe(0);
    expect(eyeOpenness(4050)).toBeCloseTo(0.5);
    expect(eyeOpenness(4200)).toBe(1);
    expect(eyeOpenness(4200 * 3 + 4100)).toBe(0);
  });
});

describe("the glitch", () => {
  it("fires 0 to 140ms and 240 to 320ms into every 5.2s", () => {
    expect(glitching(0, false)).toBe(true);
    expect(glitching(139, false)).toBe(true);
    expect(glitching(140, false)).toBe(false);
    expect(glitching(240, false)).toBe(false);
    expect(glitching(241, false)).toBe(true);
    expect(glitching(320, false)).toBe(false);
    expect(glitching(5200 + 10, false)).toBe(true);
    expect(glitching(2000, false)).toBe(false);
  });

  it("adds 70ms every 1.3s while the button is hovered", () => {
    expect(glitching(1300 + 69, true)).toBe(true);
    expect(glitching(1300 + 70, true)).toBe(false);
    expect(glitching(1300 + 69, false)).toBe(false);
  });

  it("changes frame every 45ms", () => {
    expect(glitchFrame(44)).toBe(0);
    expect(glitchFrame(45)).toBe(1);
  });

  it("slides only every seventh row, by +3 or -2", () => {
    const rows = Array.from({ length: 40 }, (_, row) => glitchShift(row, 0));
    const moved = rows.filter(Boolean);
    expect(moved.length).toBeGreaterThan(0);
    expect(moved.length).toBeLessThan(rows.length / 3);
    for (const shift of moved) expect([3, -2]).toContain(shift);
    // Row 0 at frame 0: (0*31 + 0) % 7 === 0 and (0 + 0) % 2 === 0, so -2.
    expect(glitchShift(0, 0)).toBe(-2);
    expect(glitchShift(1, 0)).toBe(0);
  });

  it("turns one cell in three into a slash or bracket", () => {
    const glyphs = Array.from({ length: 12 }, (_, col) => glitchGlyph(col, 4, 2));
    expect(glyphs.filter(Boolean)).toHaveLength(4);
    for (const glyph of glyphs.filter(Boolean)) expect("/<>").toContain(glyph);
  });
});

describe("pose", () => {
  it("follows the pointer within +-0.7 and +-0.4 radians", () => {
    expect(targetPose(0, { x: 1, y: -1 })).toEqual({ yaw: 0.7, pitch: -0.4 });
    expect(targetPose(0, { x: 0, y: 0 })).toEqual({ yaw: 0, pitch: 0 });
  });

  it("sways on its own when nothing is pointing", () => {
    expect(targetPose(0, null)).toEqual({ yaw: 0, pitch: 0 });
    const t = targetPose(2600 * (Math.PI / 2), null);
    expect(t.yaw).toBeCloseTo(0.5);
  });

  it("turns a tenth of the way each frame", () => {
    expect(ease(0, 1)).toBeCloseTo(0.1);
    expect(ease(1, 1)).toBe(1);
  });

  it("breathes by 1.5%", () => {
    for (const ms of [0, 500, 1414, 3000, 12345]) expect(Math.abs(breath(ms) - 1)).toBeLessThanOrEqual(0.015);
  });
});

describe("renSources", () => {
  const grid = renGrid(600, 600);
  const sources = renSources(grid, 600, 600);

  it("is one particle for every cell on the sphere's face, and none outside it", () => {
    // A disc of radius 240 over cells 10 by 17: about pi r^2 / (10 * 17).
    expect(sources.length).toBeGreaterThan(900);
    expect(sources.length).toBeLessThan(1200);
    for (const s of sources) {
      const dx = (s.x - 300) / grid.radius;
      const dy = (s.y - 300) / grid.radius;
      expect(dx * dx + dy * dy).toBeLessThanOrEqual(1);
    }
  });

  it("uses Ren's own six reds, brightest where the light falls", () => {
    for (const s of sources) expect(REDS as readonly string[]).toContain(s.color);
    const lit = sources.reduce((best, s) => (s.x + s.y < best.x + best.y ? s : best));
    const dark = sources.reduce((best, s) => (s.x + s.y > best.x + best.y ? s : best));
    expect(REDS.indexOf(lit.color as (typeof REDS)[number])).toBeGreaterThan(REDS.indexOf(dark.color as (typeof REDS)[number]));
  });

  it("makes a particle bigger where it is brighter, and never smaller than 14% of a cell", () => {
    for (const s of sources) {
      expect(s.r).toBeGreaterThanOrEqual(grid.cw * 0.14);
      expect(s.r).toBeLessThanOrEqual(grid.cw * 0.44);
    }
  });
});

const matching =
  (...queries: string[]) =>
  (query: string) =>
    queries.includes(query);

describe("tracksPointer", () => {
  it("follows a mouse or a trackpad", () => {
    expect(tracksPointer(matching())).toBe(true);
    expect(tracksPointer(matching("(hover: hover)", "(pointer: fine)"))).toBe(true);
  });

  it("does not follow a touch screen: no hover, or a coarse pointer", () => {
    expect(tracksPointer(matching("(hover: none)"))).toBe(false);
    expect(tracksPointer(matching("(pointer: coarse)"))).toBe(false);
    expect(tracksPointer(matching("(hover: none)", "(pointer: coarse)"))).toBe(false);
  });
});
