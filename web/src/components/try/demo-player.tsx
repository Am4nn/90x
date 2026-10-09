"use client";

import { type RefObject, useEffect, useRef, useState } from "react";
import { SpeedPill } from "@/components/audio/speed-pill";
import { Transcript } from "@/components/audio/transcript";
import { Ren } from "@/components/coach/ren";
import { PauseIcon, PlayIcon, Skip15Icon, SpinnerIcon } from "@/components/icons";
import { ConsentNote } from "@/components/landing/consent-note";
import { GoogleCta } from "@/components/landing/sign-in-buttons";
import {
  clampSeek,
  currentLine,
  formatTime,
  isFinished,
  onError,
  remaining,
  sections,
  SKIP_S,
  type Speed,
  type TimedLine,
} from "@/lib/audio/rules";
import { TRY_LESSON } from "@/lib/landing/try-cards";
import {
  type Demo,
  demoFrom,
  demoSrc,
  nextState,
  type NowPlaying,
  nowPlaying,
  type PlayerEvent,
  type PlayerState,
  resumeAt,
} from "@/lib/try/player-rules";

// The app's own chip names (components/audio/full-player.tsx).
const SECTION_LABEL: Record<string, string> = {
  intro: "Intro",
  walkthrough: "Walkthrough",
  pitfalls: "Pitfalls",
  recap: "Recap",
};
const CANT_PLAY = "Can't play right now. The lesson is still here to read.";

/** The public route's answer: the lesson to play, or why there is none. */
async function askRoute(): Promise<Demo | "missing" | "failed"> {
  try {
    const res = await fetch("/api/audio/demo");
    if (res.status === 404) return "missing";
    if (!res.ok) return "failed";
    return demoFrom(await res.json()) ?? "failed";
  } catch {
    return "failed"; // no network, or a body that is not JSON
  }
}

/** A play() cut short by a pause (or by the player leaving): not a failure, so it says nothing. */
const aborted = (e: unknown) => e instanceof DOMException && e.name === "AbortError";

/**
 * /try's player for the one public lesson. Nothing is asked for until the first press of the listen bar; then it
 * becomes the app's full player (scrubber with section ticks, chips, ±15 s, play, speed, transcript), without the
 * signed-in parts: no download, nothing saved past the visit. One element for the visit: a phone's tab change only
 * hides the player, so the lesson plays on under the cards (the listen row there shows it and plays or pauses it
 * through `toggleRef`). The element is released only when the player leaves the page (crossing the md breakpoint
 * moves the lesson); the position and speed are the page's (TryClient's), so the next press resumes where it was.
 */
export function DemoPlayer({
  onPlayed,
  onFinished,
  onPaused,
  onMissing,
  missing,
  nudge,
  rate,
  onRate,
  positionRef,
  onNow,
  toggleRef,
}: {
  /** The first time the audio starts. */
  onPlayed: () => void;
  /** The first time 95% has been heard. */
  onFinished: () => void;
  /** The listener paused it (not a headset, not the end), with the position in seconds. */
  onPaused: (atS: number) => void;
  /** The route said there is no audio (404). */
  onMissing: () => void;
  /** Already known to have no audio: say so without asking again. */
  missing: boolean;
  /** Show Ren's sign-in nudge. */
  nudge: boolean;
  /** The speed for the visit. */
  rate: Speed;
  onRate: (r: Speed) => void;
  /** The last position heard, for the visit: written as it plays and on a seek, read when the file loads. */
  positionRef: RefObject<{ atS: number }>;
  /** What the listen row shows: told on mount and whenever it changes (whole seconds). */
  onNow: (now: NowPlaying) => void;
  /** Filled with this player's play/pause press while it is in the page, for the listen row's button. */
  toggleRef: RefObject<(() => void) | null>;
}) {
  const [state, setState] = useState<PlayerState>(missing ? { kind: "missing" } : { kind: "idle" });
  const [positionS, setPositionS] = useState(0);
  const [lines, setLines] = useState<TimedLine[]>([]);
  /** The one element, made on the first press (a browser plays only after a tap) and released on unmount. */
  const box = useRef<{ el: HTMLAudioElement | null }>({ el: null });
  const busy = useRef(false);
  const retried = useRef(false);
  const played = useRef(false);
  const finished = useRef(false);
  const send = (e: PlayerEvent) => setState((s) => nextState(s, e));
  const fail = (e: unknown) => {
    if (!aborted(e)) send({ type: "failed" });
  };
  // The element's listeners outlive a render: they call the latest handlers through this.
  const latest = useRef<{
    heard: () => void;
    started: () => void;
    element: (e: PlayerEvent) => void;
    error: () => void;
  }>({
    heard: () => {},
    started: () => {},
    element: () => {},
    error: () => {},
  });

  // Leaving the page (crossing the md breakpoint moves the lesson) stops the audio and lets the file go.
  useEffect(() => {
    const b = box.current;
    return () => {
      const el = b.el;
      if (!el) return;
      b.el = null;
      el.pause();
      el.removeAttribute("src");
      el.load();
      el.remove();
    };
  }, []);

  function element(): HTMLAudioElement {
    if (box.current.el) return box.current.el;
    const el = new Audio();
    el.preload = "metadata";
    // In the document (hidden) so tests and devtools can find the one element.
    el.hidden = true;
    document.body.append(el);
    el.addEventListener("timeupdate", () => latest.current.heard());
    // Whatever plays or pauses it (this player, a headset, the lock screen), the button follows the element.
    el.addEventListener("play", () => latest.current.element({ type: "playing" }));
    el.addEventListener("playing", () => latest.current.started());
    el.addEventListener("pause", () => latest.current.element({ type: "paused" }));
    el.addEventListener("ended", () => latest.current.element({ type: "ended" }));
    el.addEventListener("error", () => latest.current.error());
    box.current.el = el;
    return el;
  }

  /** Points the element at the file at the visit's position and speed. */
  function load(el: HTMLAudioElement, demo: Demo, fresh: boolean) {
    el.src = demoSrc(demo.url, process.env.NEXT_PUBLIC_E2E_AUDIO_SRC);
    // Loading a source resets playbackRate to defaultPlaybackRate, so both carry the chosen speed.
    el.defaultPlaybackRate = rate;
    el.playbackRate = rate;
    // A lesson that was heard to the end starts over rather than ending at once; a mid-listen re-fetch keeps its place.
    const saved = positionRef.current.atS;
    const at = fresh ? resumeAt(saved, demo.durationS > 0 ? demo.durationS : 0) : saved;
    positionRef.current.atS = at;
    el.currentTime = at;
    setPositionS(at);
  }

  async function press() {
    const el = element();
    if (state.kind === "ready") {
      // The element's play and pause events update the button.
      if (el.paused) {
        // Heard to the end: start over rather than end at once (the listen row's Play after Finished, too).
        const at = resumeAt(el.currentTime, state.durationS);
        if (at !== el.currentTime) seek(at);
        el.play().catch(fail);
      } else {
        el.pause();
        onPaused(el.currentTime);
      }
      return;
    }
    if (busy.current || (state.kind !== "idle" && state.kind !== "failed")) return;
    busy.current = true;
    retried.current = false;
    send({ type: "press" });
    const demo = await askRoute();
    busy.current = false;
    if (box.current.el !== el) return; // the player left the page while it asked
    if (demo === "missing") {
      send({ type: "missing" });
      onMissing();
      return;
    }
    if (demo === "failed") {
      send({ type: "failed" });
      return;
    }
    setLines(demo.lines);
    load(el, demo, true);
    try {
      await el.play();
    } catch (e) {
      if (!aborted(e)) {
        fail(e);
        return;
      }
      // Cut short by a pause before it began: the file is loaded, so open the player paused and the next press plays.
      send({
        type: "loaded",
        durationS: demo.durationS > 0 ? demo.durationS : el.duration || 0,
        playing: false,
      });
      return;
    }
    send({
      type: "loaded",
      durationS: demo.durationS > 0 ? demo.durationS : el.duration || 0,
    });
  }

  // A playback error mid-listen (an expired URL): one fresh URL from the route, resumed where it stopped; after that, the 503 line.
  async function failMidListen() {
    const el = box.current.el;
    if (!el || state.kind !== "ready" || !el.getAttribute("src")) return;
    const next = onError({ retried: retried.current });
    retried.current = next.retried;
    if (next.action === "fail") {
      send({ type: "failed" });
      return;
    }
    const demo = await askRoute();
    if (box.current.el !== el) return;
    if (typeof demo === "string") {
      send({ type: "failed" });
      return;
    }
    load(el, demo, false);
    if (state.playing) el.play().catch(fail);
  }

  function heard() {
    const el = box.current.el;
    if (!el || state.kind !== "ready") return;
    positionRef.current.atS = el.currentTime;
    setPositionS(el.currentTime);
    if (!finished.current && isFinished(el.currentTime, state.durationS)) {
      finished.current = true;
      onFinished();
    }
  }

  useEffect(() => {
    latest.current = {
      heard,
      element: send,
      started: () => {
        // The first time audio really plays (the `playing` event, not `play`, which fires as play() is called and may still be rejected).
        if (played.current) return;
        played.current = true;
        onPlayed();
      },
      error: () => void failMidListen(),
    };
    toggleRef.current = () => void press();
  });
  // Gone from the page: the listen row's button has nothing to press.
  useEffect(
    () => () => {
      toggleRef.current = null;
    },
    [toggleRef],
  );

  // The listen row under the cards follows the player; whole seconds, so this runs once a second at most.
  const { status, positionS: nowS, durationS: nowLengthS } = nowPlaying(state, positionS);
  useEffect(() => onNow({ status, positionS: nowS, durationS: nowLengthS }), [onNow, status, nowS, nowLengthS]);

  function seek(s: number) {
    const el = box.current.el;
    if (!el || state.kind !== "ready") return;
    el.currentTime = clampSeek(s, state.durationS);
    positionRef.current.atS = el.currentTime;
    setPositionS(el.currentTime);
  }

  function changeRate(r: Speed) {
    onRate(r);
    const el = box.current.el;
    if (!el) return;
    el.defaultPlaybackRate = r;
    el.playbackRate = r;
  }

  if (state.kind === "missing") return <p className="text-small text-mute">Audio isn&apos;t available yet.</p>;

  return state.kind === "ready" ? (
    <Player
      durationS={state.durationS}
      playing={state.playing}
      positionS={positionS}
      lines={lines}
      rate={rate}
      nudge={nudge}
      onToggle={press}
      onSeek={seek}
      onRate={changeRate}
    />
  ) : (
    <ListenBar loading={state.kind === "loading"} failed={state.kind === "failed"} onPress={press} />
  );
}

/** Before the first play, and after a failure: the bar that asks for the lesson, and why it can't play. */
function ListenBar({ loading, failed, onPress }: { loading: boolean; failed: boolean; onPress: () => void }) {
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={onPress}
        aria-label={`Listen, ${TRY_LESSON.durationText}`}
        aria-busy={loading || undefined}
        className="flex h-12 w-full items-center gap-2.5 rounded-lg border border-line bg-surface-2 px-3.5 text-left transition-colors hover:border-line-2"
      >
        {loading ? (
          <SpinnerIcon className="size-4 animate-spin text-cyan motion-reduce:animate-none" />
        ) : (
          <PlayIcon className="size-4 text-cyan" />
        )}
        <span className="text-body font-semibold text-text">Listen</span>
        <span className="font-mono text-small text-mute">{TRY_LESSON.durationText}</span>
      </button>
      {failed && (
        <p role="alert" className="text-small text-text-2">
          {CANT_PLAY}
        </p>
      )}
    </div>
  );
}

/** Playing or paused: the app's full player (components/audio/full-player.tsx) from the scrubber down, then Ren's nudge and the transcript. */
function Player({
  durationS,
  playing,
  positionS,
  lines,
  rate,
  nudge,
  onToggle,
  onSeek,
  onRate,
}: {
  durationS: number;
  playing: boolean;
  positionS: number;
  lines: TimedLine[];
  rate: Speed;
  nudge: boolean;
  onToggle: () => void;
  onSeek: (s: number) => void;
  onRate: (r: Speed) => void;
}) {
  // The e2e tone runs past the lesson's length; what is shown stops at the end.
  const shownS = Math.min(positionS, durationS);
  const ticks = sections(lines);
  const now = currentLine(lines, positionS);
  const nowSection = now >= 0 ? lines[now]?.section : null;
  const pct = durationS > 0 ? (shownS / durationS) * 100 : 0;

  return (
    <div data-try="player" className="flex flex-col gap-4.5">
      <div className="flex flex-col gap-1.5 pt-1">
        <div className="relative flex h-6 items-center">
          {ticks.slice(1).map((t) => (
            <span
              key={t.section}
              aria-hidden
              className="absolute top-1 h-4 w-px bg-line-2"
              style={{
                left: `${durationS > 0 ? (t.start_s / durationS) * 100 : 0}%`,
              }}
            />
          ))}
          <span aria-hidden className="h-1 w-full rounded-full bg-line-2">
            <span className="block h-1 rounded-full bg-cyan" style={{ width: `${pct}%` }} />
          </span>
          <span aria-hidden className="absolute size-3.5 -translate-x-1/2 rounded-full bg-cyan" style={{ left: `${pct}%` }} />
          {/* The real control: a native range on top, invisible, so dragging, keys and screen readers just work. */}
          <input
            type="range"
            min={0}
            max={Math.max(1, Math.floor(durationS))}
            step={1}
            value={Math.floor(shownS)}
            onChange={(e) => onSeek(Number(e.target.value))}
            aria-label="Position"
            aria-valuetext={`${formatTime(shownS)} of ${formatTime(durationS)}`}
            className="absolute inset-0 h-6 w-full cursor-pointer opacity-0"
          />
        </div>
        <div className="flex justify-between font-mono text-tag text-mute">
          <span>{formatTime(shownS)}</span>
          <span>{remaining(shownS, durationS)}</span>
        </div>
      </div>

      {/* Section chips beside the speed pill, as the app's player has them. */}
      <div className="flex items-center justify-between gap-3">
        {ticks.length > 0 ? (
          <div role="group" aria-label="Sections" className="flex flex-wrap gap-2">
            {ticks.map((t) => {
              const on = t.section === nowSection;
              return (
                <button
                  key={t.section}
                  type="button"
                  onClick={() => onSeek(t.start_s)}
                  aria-current={on ? "true" : undefined}
                  // 32px to see, 44px to tap on a phone: the pseudo-element reaches 6px above and below.
                  className={`relative inline-flex h-8 items-center rounded-lg border px-3 text-small font-semibold after:absolute after:inset-x-0 after:-inset-y-1.5 md:after:hidden ${on ? "border-cyan bg-cyan text-on-cyan" : "border-line-2 bg-surface-2 text-text-2"}`}
                >
                  {SECTION_LABEL[t.section] ?? t.section}
                </button>
              );
            })}
          </div>
        ) : (
          <span />
        )}
        <SpeedPill rate={rate} onChange={onRate} />
      </div>

      <div className="flex items-center justify-center gap-8">
        <button
          type="button"
          aria-label={`Back ${SKIP_S} seconds`}
          onClick={() => onSeek(positionS - SKIP_S)}
          className="inline-flex size-11 items-center justify-center rounded-xl text-text"
        >
          <Skip15Icon className="size-10" />
        </button>
        <button
          type="button"
          aria-label={playing ? "Pause" : "Play"}
          onClick={onToggle}
          className="inline-flex size-16 items-center justify-center rounded-full bg-cyan text-on-cyan"
        >
          {playing ? <PauseIcon className="size-6.5" /> : <PlayIcon className="size-6.5" />}
        </button>
        <button
          type="button"
          aria-label={`Forward ${SKIP_S} seconds`}
          onClick={() => onSeek(positionS + SKIP_S)}
          className="inline-flex size-11 items-center justify-center rounded-xl text-text"
        >
          <Skip15Icon forward className="size-10" />
        </button>
      </div>

      <span aria-hidden className="h-px shrink-0 bg-line" />

      {nudge && (
        <div className="flex flex-col gap-3 rounded-xl border border-line-2 bg-surface-2 p-4">
          <div className="flex items-start gap-2.5">
            <Ren size={26} />
            <div className="flex flex-col gap-0.5">
              <p className="text-body font-semibold text-text">{`That was one of ${TRY_LESSON.count} lessons.`}</p>
              <p className="text-small text-text-2">Sign in and Day 1 picks what you need next.</p>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <GoogleCta spot="try" compact className="w-full" />
            <ConsentNote className="text-center" />
          </div>
        </div>
      )}

      {/* The transcript follows the voice inside its own bounded box, so the page (and the controls) never move. */}
      <div className="flex max-h-96 flex-col md:max-h-72">
        <Transcript lines={lines} positionS={positionS} onSeek={onSeek} />
      </div>
    </div>
  );
}
