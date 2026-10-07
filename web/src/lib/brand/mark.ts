// The 90x mark (brand mock): "90" in Sora 700 and
// an x drawn as two cyan round-capped strokes, laid out in a 100×100 box from
// measured glyphs. scripts/make-icons.ts measures Sora and writes the result
// to mark-geometry.ts; everything else draws from that file.

/** Tokens from globals.css (--x-*), for places that can't read CSS: PNGs, the link card, the share card. */
export const BRAND_COLORS = {
  bg: "#0a0c10",
  surface2: "#141820",
  line: "#1c2029",
  line2: "#262b36",
  text: "#e6e9ef",
  text2: "#aeb5c2",
  mute: "#7d8594",
  accent: "#67e8f9",
  accentBg: "#0e1e24",
} as const;

export const MARK_BOX = 100;
export const MARK_FONT_SIZE = 38;
export const MARK_STROKE = 6;
/** Space between the ink of the "0" and the x, as a fraction of the font size. */
const GAP = 0.14;

/** Ink of "90" (relative to the pen origin, y up) and Sora's x-height, at MARK_FONT_SIZE. */
export interface GlyphMetrics {
  inkLeft: number;
  inkRight: number;
  capHeight: number;
  xHeight: number;
}

export interface Line {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface MarkLayout {
  /** Where the pen starts "90" so its ink begins at `left`. */
  textX: number;
  baseline: number;
  /** The whole mark's ink, left to right. */
  left: number;
  width: number;
  strokes: [Line, Line];
}

/**
 * The x is a square as tall as the x-height on the same baseline as "90", a
 * gap after the "0"; the strokes are inset by half their width so their
 * round caps end on that square. The group is centred horizontally and the
 * cap height of "90" vertically.
 */
export function layoutMark(m: GlyphMetrics): MarkLayout {
  const inkWidth = m.inkRight - m.inkLeft;
  const gap = MARK_FONT_SIZE * GAP;
  const width = inkWidth + gap + m.xHeight;
  const left = (MARK_BOX - width) / 2;
  const baseline = MARK_BOX / 2 + m.capHeight / 2;
  const xLeft = left + inkWidth + gap;
  const inset = MARK_STROKE / 2;
  const top = baseline - m.xHeight + inset;
  const bottom = baseline - inset;
  const near = xLeft + inset;
  const far = xLeft + m.xHeight - inset;
  return {
    textX: left - m.inkLeft,
    baseline,
    left,
    width,
    strokes: [
      { x1: near, y1: top, x2: far, y2: bottom },
      { x1: far, y1: top, x2: near, y2: bottom },
    ],
  };
}

/** Scale that makes the mark span `fraction` of the box. */
export const markScale = (markWidth: number, fraction: number) => (fraction * MARK_BOX) / markWidth;
