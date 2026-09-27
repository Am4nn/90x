import { BRAND_COLORS, type Line, MARK_BOX, MARK_STROKE, markScale } from "./mark";

export interface MarkGeometry {
  /** "90" as outlines, placed in the 100×100 box. */
  ninety: string;
  /** Ink width of the whole mark. */
  width: number;
  strokes: readonly [Line, Line];
}

interface Options {
  /** Pixels; the drawing is always in the 100×100 box. */
  size: number;
  /** rounded: the favicon tile (~22% radius). square: opaque edge to edge, for launchers that crop. none: transparent. */
  tile: "rounded" | "square" | "none";
  /** How much of the box the mark spans. Left out, it keeps the approved favicon proportions. */
  fraction?: number;
}

const round = (n: number) => Math.round(n * 1000) / 1000;

/** The mark's shapes in the 100×100 box, without the <svg> around them. */
export function markElements(geometry: MarkGeometry): string {
  const { text, accent } = BRAND_COLORS;
  const lines = geometry.strokes
    .map(
      (l) =>
        `<line x1="${l.x1}" y1="${l.y1}" x2="${l.x2}" y2="${l.y2}" stroke="${accent}" stroke-width="${MARK_STROKE}" stroke-linecap="round"/>`,
    )
    .join("");
  return `<path d="${geometry.ninety}" fill="${text}"/>${lines}`;
}

/** The mark as a standalone SVG: the one drawing every icon, the favicon and the link card come from. */
export function markSvg(geometry: MarkGeometry, { size, tile, fraction }: Options): string {
  const { bg } = BRAND_COLORS;
  const box = MARK_BOX;
  const rect =
    tile === "rounded"
      ? `<rect width="${box}" height="${box}" rx="${box * 0.22}" fill="${bg}"/>`
      : tile === "square"
        ? `<rect width="${box}" height="${box}" fill="${bg}"/>`
        : "";
  const mark = markElements(geometry);
  const c = box / 2;
  const body =
    fraction === undefined
      ? mark
      : `<g transform="translate(${c} ${c}) scale(${round(markScale(geometry.width, fraction))}) translate(-${c} -${c})">${mark}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${box} ${box}">${rect}${body}</svg>`;
}
