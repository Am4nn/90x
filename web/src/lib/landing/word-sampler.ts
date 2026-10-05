// How a word (or a tick) becomes dots. The overlay draws the word on a hidden canvas, hands
// the picture's alpha channel here, and gets back dots scattered over the ink, thicker in the
// middle of a stroke and thinning at its edge. The picture's own alpha is the only input, so
// this is tested with a made-up picture, without a canvas.
import { seeded } from "./rng";

interface ShapeDot {
  x: number;
  y: number;
  /** 0.55 to 1.45: scales the dot's radius, bigger towards the heart of a stroke. */
  size: number;
  /** A phase for the dot's slow wobble. */
  phase: number;
}

export interface Shape {
  dots: ShapeDot[];
  /** About how far apart the dots are: the dot radius is a fraction of this. */
  spacing: number;
}

/** The seed a label's dots are scattered from, so the same label is scattered the same way every time. */
export const seedFor = (label: string): number => label.length * 977 + 13;

/**
 * Up to `maxDots` dots over a picture `width` by `height` whose alpha channel is `alpha`.
 * A short picture (under 160px) takes denser dots, one for every 9 pixels of ink, others one for 22.
 */
export function sampleShape(alpha: ArrayLike<number>, width: number, height: number, maxDots: number, seed: number): Shape {
  let ink = 0;
  for (let i = 0; i < alpha.length; i++) if (alpha[i]! > 128) ink++;
  const target = Math.min(maxDots, Math.max(60, Math.round(ink / (height < 160 ? 9 : 22))));
  const random = seeded(seed);
  const dots: ShapeDot[] = [];
  for (let tries = 0; dots.length < target && tries < target * 60; tries++) {
    const x = random() * width;
    const y = random() * height;
    const coverage = alpha[Math.floor(y) * width + Math.floor(x)]! / 255;
    // Edges (partial alpha) are accepted less often, so they scatter.
    if (random() < Math.pow(coverage, 1.6)) dots.push({ x, y, size: 0.55 + random() * 0.9 * coverage, phase: random() * Math.PI * 2 });
  }
  return { dots, spacing: Math.sqrt(ink / Math.max(1, dots.length)) };
}
