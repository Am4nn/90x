// The design's off-palette colours as mixes of the app's own tokens
// (no new tokens). Each sits within a few units of the mock's hex, noted beside it.
// Full class names, so Tailwind sees them.

import type { Mastery } from "@/lib/library/map-layout";
import type { ProblemRow } from "@/lib/library/queries";

/** Problem status icon: fill and border. Solved #5FAE7E, hints #B8954A, missed #C46A6A, not tried #3A4050 (border only). */
export const STATUS_ICON: Record<NonNullable<ProblemRow["status"]> | "todo", string> = {
  solved:
    "border-[color-mix(in_srgb,color-mix(in_srgb,var(--color-text)_30%,var(--color-ok))_75%,var(--color-surface))] bg-[color-mix(in_srgb,color-mix(in_srgb,var(--color-text)_30%,var(--color-ok))_75%,var(--color-surface))]",
  hints:
    "border-[color-mix(in_srgb,color-mix(in_srgb,var(--color-surface-2)_60%,var(--color-text))_50%,var(--color-warn))] bg-[color-mix(in_srgb,color-mix(in_srgb,var(--color-surface-2)_60%,var(--color-text))_50%,var(--color-warn))]",
  failed:
    "border-[color-mix(in_srgb,color-mix(in_srgb,var(--color-surface-2)_25%,var(--color-bad))_90%,var(--color-text))] bg-[color-mix(in_srgb,color-mix(in_srgb,var(--color-surface-2)_25%,var(--color-bad))_90%,var(--color-text))]",
  todo: "border-[color-mix(in_srgb,var(--color-line-2)_75%,var(--color-mute))]",
};

/** Difficulty in the meta line. Easy #6FBF8E, Medium #C9A24E, Hard #D27A7A. */
export const DIFFICULTY: Record<string, string> = {
  Easy: "text-[color-mix(in_srgb,color-mix(in_srgb,var(--color-surface)_25%,var(--color-ok))_70%,var(--color-text))]",
  Medium: "text-[color-mix(in_srgb,color-mix(in_srgb,var(--color-mute)_45%,var(--color-warn))_90%,var(--color-bad))]",
  Hard: "text-[color-mix(in_srgb,var(--color-mute)_30%,var(--color-bad))]",
};

/** A pattern's progress arc on the map: weak #C46A6A, mastered #4FB3C4, otherwise #AEB5C2. */
export const RING: Record<Mastery, string> = {
  weak: "stroke-[color-mix(in_srgb,color-mix(in_srgb,var(--color-surface-2)_25%,var(--color-bad))_90%,var(--color-text))]",
  mastered: "stroke-[color-mix(in_srgb,var(--color-surface)_25%,var(--color-cyan))]",
  started: "stroke-text-2",
  untouched: "stroke-text-2",
};

/** The status dot in the pattern dropdown: mastered #4FB3C4, started #AEB5C2, weak #C46A6A, untouched #3A4050. */
export const DOT_FILL: Record<Mastery, string> = {
  mastered: "bg-[color-mix(in_srgb,var(--color-surface)_25%,var(--color-cyan))]",
  started: "bg-text-2",
  weak: "bg-[color-mix(in_srgb,color-mix(in_srgb,var(--color-surface-2)_25%,var(--color-bad))_90%,var(--color-text))]",
  untouched: "bg-[color-mix(in_srgb,var(--color-line-2)_75%,var(--color-mute))]",
};

/** The map's own ground, a shade under the panels (#0D1015). */
export const MAP_BG = "bg-[color-mix(in_srgb,var(--color-background)_35%,var(--color-surface))]";
