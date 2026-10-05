// Ren on the landing page: a sphere drawn in text, shaded by one light. Everything
// here is arithmetic over numbers, so it is tested on its own; the canvas, the glyph
// atlas and the loop that paint it are in ren-renderer.ts.
//
// The numbers are the designer's (landing page design): the ramp,
// the six reds, the light, the 18th-power highlight, the eyes and the glitch rhythm.

/** Dark to light; a cell's brightness picks one. */
export const RAMP = " .,:;-=+*#%@";
/** Ren's six reds, dark to light. The canvas cannot read CSS tokens, so they are repeated here. */
export const REDS = ["#3A0A16", "#6E1028", "#A8122F", "#E0193F", "#FF3D68", "#FF8FA8"] as const;
export const REN_EYE = "#FFFFFF";
export const REN_SHADOW = "#1C2029";
export const REN_GLITCH = "#67E8F9";
/** The shadow under Ren, and the glitch glyphs, are drawn from the same atlas as the sphere. */
export const REN_CHARS = `${RAMP}@=-/<>`;
export const REN_COLORS: readonly string[] = [...REDS, REN_EYE, REN_SHADOW, REN_GLITCH];

/** The light's direction, pointing from the sphere towards it. */
const LIGHT = [-0.52, -0.57, 0.64] as const;
const GLITCH_GLYPHS = "/<>";

/** Where Ren is on the page: how many columns, how big each cell is, how big the sphere is. */
export interface RenGrid {
  cols: number;
  rows: number;
  /** Cell width and height in CSS pixels; a cell is 1.7 times taller than wide. */
  cw: number;
  ch: number;
  /** Radius of the sphere in CSS pixels. */
  radius: number;
}

/** 60 columns across (44 below 320 px, where each would be too small to read). */
export function renGrid(width: number, height: number): RenGrid {
  const cols = width < 320 ? 44 : 60;
  const cw = width / cols;
  const ch = cw * 1.7;
  return { cols, rows: Math.floor(height / ch), cw, ch, radius: Math.min(width, height) * 0.4 };
}

/** Brightness 0..1 of a point on the sphere; x and y are in sphere radii from its centre, z is how far it faces us. */
function lightAt(x: number, y: number, z: number): number {
  const diffuse = Math.max(0, x * LIGHT[0] + y * LIGHT[1] + z * LIGHT[2]);
  const specular = Math.pow(Math.max(0, 2 * diffuse * z - LIGHT[2]), 18);
  return Math.min(1, Math.pow(0.06 + diffuse * 0.9 + specular * 0.7, 1.35));
}

const reddest = (light: number): string => REDS[Math.min(REDS.length - 1, Math.floor(light * REDS.length))]!;

/** One lit cell of Ren's face: where it is, in pixels from the corner of Ren's box, its colour, and the size of the particle that stands in for it. */
export interface RenSource {
  x: number;
  y: number;
  color: string;
  r: number;
}

/**
 * Every cell of the sphere's face as a particle's starting place. The particles begin as
 * Ren, in Ren's own colours, so there is no seam when Ren breaks up. (They are lit by the
 * light alone, without the specular glint, which is what they were drawn from.)
 */
export function renSources(grid: RenGrid, width: number, height: number): RenSource[] {
  const out: RenSource[] = [];
  for (let j = 0; j < grid.rows; j++) {
    for (let i = 0; i < grid.cols; i++) {
      const x = ((i + 0.5) * grid.cw - width / 2) / grid.radius;
      const y = ((j + 0.5) * grid.ch - height / 2) / grid.radius;
      const r2 = x * x + y * y;
      if (r2 > 1) continue;
      const z = Math.sqrt(1 - r2);
      const light = Math.min(1, Math.pow(0.06 + Math.max(0, x * LIGHT[0] + y * LIGHT[1] + z * LIGHT[2]) * 0.9, 1.35));
      out.push({ x: (i + 0.5) * grid.cw, y: (j + 0.5) * grid.ch, color: reddest(light), r: grid.cw * (0.14 + 0.3 * light) });
    }
  }
  return out;
}

const rampChar = (light: number): string => RAMP[Math.max(1, Math.min(RAMP.length - 1, Math.round(light * (RAMP.length - 1))))]!;

/** How open the eyes are: 1, shut and open again over 200 ms at the end of every 4.2 s. */
export function eyeOpenness(ms: number): number {
  const phase = ms % 4200;
  return phase > 4000 ? Math.abs(phase - 4100) / 100 : 1;
}

/** Ren breathes by 1.5% every 900 ms (a full cycle is 2 pi of these). */
export const breath = (ms: number): number => 1 + 0.015 * Math.sin(ms / 900);

/** Whether the picture is in a glitch: 0 to 140 ms and 240 to 320 ms of every 5.2 s, and 70 ms every 1.3 s while the button is hovered. */
export function glitching(ms: number, hovering: boolean): boolean {
  const phase = ms % 5200;
  return phase < 140 || (phase > 240 && phase < 320) || (hovering && phase % 1300 < 70);
}

/** The glitch's frame number; it changes every 45 ms, so rows and glyphs jump rather than slide. */
export const glitchFrame = (ms: number): number => Math.floor(ms / 45);

/** Columns a row slides during a glitch: every seventh row, +3 or -2. */
export function glitchShift(row: number, frame: number): number {
  if ((row * 31 + frame * 17) % 7 !== 0) return 0;
  return (row + frame) % 2 ? 3 : -2;
}

/** In a shifted row, one cell in three turns into a cyan slash or bracket. */
export function glitchGlyph(col: number, row: number, frame: number): string | null {
  return (col + frame) % 3 === 0 ? GLITCH_GLYPHS[(col + row + frame) % 3]! : null;
}

/** Where Ren looks: at the pointer when it moved in the last three seconds, otherwise swaying on its own. */
export function targetPose(ms: number, pointer: { x: number; y: number } | null): { yaw: number; pitch: number } {
  if (pointer) return { yaw: pointer.x * 0.7, pitch: pointer.y * 0.4 };
  return { yaw: 0.5 * Math.sin(ms / 2600), pitch: 0.12 * Math.sin(ms / 3100) };
}

/** Ren turns towards the target by a tenth of the distance each frame. */
export const ease = (current: number, target: number): number => current + (target - current) * 0.1;

/** The trigonometry of one frame's pose, worked out once rather than for every cell. */
export interface RenView {
  cosYaw: number;
  sinYaw: number;
  cosPitch: number;
  sinPitch: number;
  eyeOpen: number;
}

export function renView(yaw: number, pitch: number, eyeOpen: number): RenView {
  return { cosYaw: Math.cos(yaw), sinYaw: Math.sin(yaw), cosPitch: Math.cos(pitch), sinPitch: Math.sin(pitch), eyeOpen };
}

export interface RenCell {
  char: string;
  color: string;
}

const EYE_X = 0.3;
const EYE_Y = -0.12;

/** Whether the sphere point faces an eye. The eyes are two ellipses on the face, turning with it. */
function inEye(x: number, y: number, z: number, view: RenView): boolean {
  const lx = x * view.cosYaw - z * view.sinYaw;
  const lz0 = x * view.sinYaw + z * view.cosYaw;
  const ly = y * view.cosPitch - lz0 * view.sinPitch;
  const lz = y * view.sinPitch + lz0 * view.cosPitch;
  if (lz <= 0.5) return false;
  for (const ex of [-EYE_X, EYE_X]) {
    const dx = (lx - ex) / 0.1;
    const dy = (ly - EYE_Y) / (0.17 * Math.max(0.08, view.eyeOpen));
    if (dx * dx + dy * dy < 1) return true;
  }
  return false;
}

/**
 * The character and colour for one cell, with x and y in sphere radii from the centre
 * (y down), or false when the cell is empty. Writes into `out` so a frame of two
 * thousand cells allocates nothing.
 */
export function shadeCell(x: number, y: number, view: RenView, out: RenCell): boolean {
  const r2 = x * x + y * y;
  if (r2 > 1) {
    // The ground shadow: a flat ellipse under the sphere, '=' in its core and '-' at its rim.
    const shadow = (x * x) / 1.1 + ((y - 1.08) * (y - 1.08)) / 0.012;
    if (!(shadow < 1 && y > 0.9)) return false;
    out.char = shadow < 0.4 ? "=" : "-";
    out.color = REN_SHADOW;
    return true;
  }
  const z = Math.sqrt(1 - r2);
  if (inEye(x, y, z, view)) {
    out.char = "@";
    out.color = REN_EYE;
    return true;
  }
  const light = lightAt(x, y, z);
  out.char = rampChar(light);
  out.color = reddest(light);
  return true;
}
