"use client";

import { useEffect, useRef } from "react";
import { currentLine, type TimedLine } from "@/lib/audio/rules";

/** The script: narration lines, with walkthrough state lines in mono and indented. The line
 *  being read is highlighted and kept in view; a tap jumps the audio there. */
export function Transcript({ lines, positionS, onSeek }: { lines: TimedLine[]; positionS: number; onSeek: (s: number) => void }) {
  const index = currentLine(lines, positionS);
  const box = useRef<HTMLOListElement | null>(null);
  useEffect(() => {
    if (index >= 0) box.current?.children[index]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [index]);
  if (!lines.length) return null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between px-3">
        <span className="text-tag font-semibold tracking-label text-mute">Transcript</span>
        <span className="text-tag text-mute">Tap a line to jump there</span>
      </div>
      <ol ref={box} aria-label="Transcript" className="flex flex-col gap-0.5">
        {lines.map((l, i) => {
          const on = i === index;
          const state = l.role === "state";
          return (
            <li key={`${l.start_s}-${i}`}>
              <button
                type="button"
                onClick={() => onSeek(l.start_s)}
                aria-current={on ? "true" : undefined}
                className={
                  state
                    ? `w-full rounded-lg py-1 pr-3 pl-7 text-left font-mono text-tag leading-normal ${on ? "bg-surface-2 text-text-2" : "text-mute"}`
                    : `w-full rounded-lg px-3 py-2.5 text-left text-body ${on ? "bg-surface-2 text-text" : "text-text-2"}`
                }
              >
                {l.text}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
