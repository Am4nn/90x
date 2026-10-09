// The /try demo player's rules, pure so they are unit-tested. The listen bar asks the public route for the
// demo lesson on the first press only; the answer decides whether the player opens, says the audio isn't
// there yet (404), or says it can't play right now (503 or no network: one more press asks again).
import type { TimedLine } from "@/lib/audio/rules";

export type PlayerState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; durationS: number; playing: boolean }
  | { kind: "missing" }
  | { kind: "failed" };

/** `playing`, `paused` and `ended` are the element's own events: once the player is open, it says whether it plays. */
export type PlayerEvent =
  | { type: "press" }
  | {
      type: "loaded";
      durationS: number;
      /** false when the first play was cut short by a pause: open the player paused. */ playing?: boolean;
    }
  | { type: "missing" }
  | { type: "failed" }
  | { type: "playing" }
  | { type: "paused" }
  | { type: "ended" };

export function nextState(s: PlayerState, e: PlayerEvent): PlayerState {
  switch (e.type) {
    case "press":
      // Open, the press acts on the element and its play/pause events follow; it changes nothing here.
      return s.kind === "idle" || s.kind === "failed" ? { kind: "loading" } : s;
    case "loaded":
      return s.kind === "loading" ? { kind: "ready", durationS: e.durationS, playing: e.playing ?? true } : s;
    case "missing":
      return { kind: "missing" };
    case "failed":
      return { kind: "failed" };
    case "playing":
      return s.kind === "ready" && !s.playing ? { ...s, playing: true } : s;
    case "paused":
    case "ended":
      return s.kind === "ready" && s.playing ? { ...s, playing: false } : s;
  }
}

/** The file to play: the e2e build's local tone (NEXT_PUBLIC_E2E_AUDIO_SRC, never set in Vercel) over the signed URL. */
export const demoSrc = (url: string, e2e: string | undefined) => e2e || url;

export type Demo = { url: string; durationS: number; lines: TimedLine[] };

/** The route's 200 body, only in the shape it promises (a URL and a list of lines); anything else is treated as a failure. */
export function demoFrom(body: unknown): Demo | null {
  if (typeof body !== "object" || body === null) return null;
  const { url, durationS, lines } = body as Record<string, unknown>;
  if (typeof url !== "string" || !Array.isArray(lines)) return null;
  return {
    url,
    durationS: typeof durationS === "number" && durationS > 0 ? durationS : 0,
    lines: lines as TimedLine[],
  };
}

/** Where a returning listener starts: the saved position, or 0 when it is within a second of the end (or past it). */
export function resumeAt(atS: number, durationS: number): number {
  return durationS > 0 && atS >= durationS - 1 ? 0 : atS;
}
