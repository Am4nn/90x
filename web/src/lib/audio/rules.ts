// The player's rules, pure so they are unit-tested (vitest covers src/lib only). The components in
// src/components/audio call these and own nothing but wiring.

export type TimedLine = { role: "narrator" | "state"; text: string; section: string | null; start_s: number; end_s: number };

export const SPEEDS = [0.8, 1, 1.25, 1.5, 1.75, 2] as const;
export type Speed = (typeof SPEEDS)[number];
export const SKIP_S = 15;
export const FINISHED_AT = 0.95;
export const SAVE_EVERY_MS = 15_000;
/** Section chips and scrubber ticks. Matches the section names stored in `lines`. */
const SECTIONS_UI = true;
/** Within this many seconds of the end, Resume starts over instead. */
const NEAR_END_S = 5;

export const isFinished = (positionS: number, durationS: number) => durationS > 0 && positionS / durationS >= FINISHED_AT;

export function shouldSave(lastSavedAt: number, now: number, reason: "tick" | "pause" | "seek" | "hide"): boolean {
  return reason !== "tick" || now - lastSavedAt >= SAVE_EVERY_MS;
}

export function resumeFrom(progress: { positionS: number; finishedAt: string | null } | null, durationS: number): number {
  if (!progress || progress.finishedAt) return 0;
  if (durationS > 0 && progress.positionS >= durationS - NEAR_END_S) return 0;
  return Math.max(0, progress.positionS);
}

export function formatTime(s: number): string {
  const whole = Math.max(0, Math.floor(s));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

export const remaining = (positionS: number, durationS: number) => `-${formatTime(Math.max(0, durationS - positionS))}`;

export const clampSeek = (positionS: number, durationS: number) =>
  Math.min(Math.max(0, positionS), durationS > 0 ? durationS : Math.max(0, positionS));

/** One fresh URL on an error (an expired or revoked signature), then "Can't play right now". */
export function onError(state: { retried: boolean }): { action: "refresh" | "fail"; retried: true } {
  return { action: state.retried ? "fail" : "refresh", retried: true };
}

export function currentLine(lines: TimedLine[], positionS: number): number {
  let index = -1;
  for (const [i, line] of lines.entries()) if (line.start_s <= positionS) index = i;
  return index;
}

export function sections(lines: TimedLine[]): { section: string; start_s: number }[] {
  if (!SECTIONS_UI) return [];
  const out: { section: string; start_s: number }[] = [];
  for (const line of lines) {
    if (line.section && out.at(-1)?.section !== line.section) out.push({ section: line.section, start_s: line.start_s });
  }
  return out;
}
