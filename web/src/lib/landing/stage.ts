// What the pieces of the landing page tell each other. Ren, the dot wordmark and the
// particle overlay are separate chunks that load on their own schedules; the overlay needs
// to know where Ren's cells and the wordmark's dots are, and the other two need to know when
// the overlay has taken over. They meet here, and nowhere else.
import type { RenGrid } from "./ren";

/** Ren's drawing, as the overlay needs it. */
export interface RenInfo {
  grid: RenGrid;
  /** The size of Ren's box in CSS pixels. */
  width: number;
  height: number;
}

export interface WordmarkDot {
  /** Where, in CSS pixels from the corner of the close section. */
  x: number;
  y: number;
  /** 0 is background, 1 a "90" dot, 2 an "x" dot. */
  type: 0 | 1 | 2;
  /** Whether a particle ends up here. On a phone two of every three letter dots have none, and are not drawn by the overlay. */
  hasParticle: boolean;
}

export interface WordmarkInfo {
  /** The distance between dots. */
  step: number;
  dots: readonly WordmarkDot[];
  /** The wordmark's font size, from which the close section's top space follows. */
  fontSize: number;
}

interface Stage {
  ren: RenInfo | null;
  mark: WordmarkInfo | null;
  /** The overlay is drawing the letters' particles and the wordmark has not yet taken over. */
  lettersHidden: boolean;
  /** The overlay is running and owns Ren's opacity. */
  overlay: boolean;
}

export const stage: Stage = { ren: null, mark: null, lettersHidden: false, overlay: false };

const listeners = new Set<() => void>();

/** Calls `listener` whenever Ren's or the wordmark's geometry changes. */
export function onStage(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function publishRen(ren: RenInfo | null) {
  stage.ren = ren;
  listeners.forEach((listener) => listener());
}

export function publishWordmark(mark: WordmarkInfo | null) {
  stage.mark = mark;
  listeners.forEach((listener) => listener());
}
