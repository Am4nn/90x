"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDownIcon } from "@/components/icons";
import { currentLine, FOLLOW_RESUME_MS, followScrollTop, lineTone, type TimedLine } from "@/lib/audio/rules";

const TONE = { past: "text-mute/50", now: "text-text", next: "text-mute" } as const;
const SCROLL_KEYS = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "]);

/** The script as lyrics (YouTube Music style): no box and no border; lines already read fade, the
 *  one being read is bright, the rest wait in grey. It scrolls in its own box (the player's controls never
 *  move) and follows the voice, keeping the current line in the upper third. A manual scroll stops the
 *  following; "Back to now" or a few seconds untouched bring it back. A tap on a line jumps the audio there. */
export function Transcript({ lines, positionS, onSeek }: { lines: TimedLine[]; positionS: number; onSeek: (s: number) => void }) {
  const index = currentLine(lines, positionS);
  const box = useRef<HTMLOListElement | null>(null);
  const [following, setFollowing] = useState(true);
  const resume = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const first = useRef(true);

  useEffect(() => {
    const el = box.current;
    const line = el?.children[index] as HTMLElement | undefined;
    if (!el || !line || !following) return;
    // The first jump (the sheet just opened) and reduced motion are instant; the rest glide.
    const still = first.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    first.current = false;
    el.scrollTo({ top: followScrollTop(line.offsetTop, el.clientHeight), behavior: still ? "auto" : "smooth" });
  }, [index, following]);

  // Only the person's own scrolling (wheel, touch, keys) stops the following; the follow itself uses
  // scrollTo, which fires none of these. Attached here, passive, rather than as handlers on the list.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const pause = () => {
      setFollowing(false);
      clearTimeout(resume.current);
      resume.current = setTimeout(() => setFollowing(true), FOLLOW_RESUME_MS);
    };
    const onKey = (e: KeyboardEvent) => {
      if (SCROLL_KEYS.has(e.key)) pause();
    };
    el.addEventListener("wheel", pause, { passive: true });
    el.addEventListener("touchmove", pause, { passive: true });
    el.addEventListener("keydown", onKey);
    return () => {
      el.removeEventListener("wheel", pause);
      el.removeEventListener("touchmove", pause);
      el.removeEventListener("keydown", onKey);
      clearTimeout(resume.current);
    };
  }, []);

  function backToNow() {
    clearTimeout(resume.current);
    setFollowing(true);
  }

  if (!lines.length) return null;
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="flex items-baseline justify-between px-3 pb-1">
        <span className="text-tag font-semibold tracking-label text-mute">Transcript</span>
        <span className="text-tag text-mute">Tap a line to jump there</span>
      </div>
      <ol
        ref={box}
        aria-label="Transcript"
        className="relative flex min-h-0 flex-1 [scrollbar-width:none] flex-col gap-0.5 overflow-y-auto overscroll-contain pt-4 pb-16 [&::-webkit-scrollbar]:hidden"
      >
        {lines.map((l, i) => {
          const tone = lineTone(i, index);
          const state = l.role === "state";
          return (
            <li key={`${l.start_s}-${i}`}>
              <button
                type="button"
                onClick={() => {
                  onSeek(l.start_s);
                  backToNow();
                }}
                aria-current={tone === "now" ? "true" : undefined}
                className={`w-full rounded-lg text-left transition-colors duration-300 hover:bg-surface-2 motion-reduce:transition-none ${TONE[tone]} ${
                  state ? "py-1 pr-3 pl-7 font-mono text-small leading-normal" : "px-3 py-2 font-display text-title leading-snug font-bold"
                }`}
              >
                {l.text}
              </button>
            </li>
          );
        })}
      </ol>
      <span aria-hidden className="pointer-events-none absolute inset-x-0 top-6 h-6 bg-linear-to-b from-surface to-transparent" />
      <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-linear-to-t from-surface to-transparent" />
      {!following && index >= 0 && (
        <button
          type="button"
          onClick={backToNow}
          className="absolute bottom-4 left-1/2 inline-flex h-9 -translate-x-1/2 items-center gap-1.5 rounded-full border border-line-2 bg-surface-2 px-3.5 text-small font-semibold whitespace-nowrap text-text shadow-lg"
        >
          <ArrowDownIcon className="size-3.5" />
          Back to now
        </button>
      )}
    </div>
  );
}
