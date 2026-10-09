"use client";

import { PlayIcon } from "@/components/icons";
import { formatTime, type Speed, type TimedLine } from "@/lib/audio/rules";
import type { FeedArea } from "@/lib/feed/view";
import { usePlayer } from "./player-provider";

type Props = {
  topicSlug: string;
  title: string;
  area: FeedArea | null;
  durationS: number;
  lines: TimedLine[];
  r2Key: string;
  /** Where Resume starts (0 for a fresh listen), from resumeFrom(). */
  resumeAt: number;
  rate: Speed;
};

/** The listen bar under the lesson title: Listen with the length, or
 *  Resume with "3:12 of 5:53" and a thin progress line. When this lesson is already in the player it reads
 *  Playing or Paused and opens the full player instead of starting over. */
export function ListenButton(props: Props) {
  const p = usePlayer();
  const current = p.track?.topicSlug === props.topicSlug;
  const at = current ? p.positionS : props.resumeAt;
  const word = current ? (p.playing ? "Playing" : "Paused") : props.resumeAt > 0 ? "Resume" : "Listen";
  const time = at > 0 ? `${formatTime(at)} of ${formatTime(props.durationS)}` : formatTime(props.durationS);
  const pct = props.durationS > 0 && at > 0 ? Math.min(100, (at / props.durationS) * 100) : 0;
  const label =
    word === "Listen"
      ? `Listen, ${formatTime(props.durationS)}`
      : word === "Resume"
        ? `Resume from ${formatTime(at)}`
        : `${word}, open the player`;
  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => {
        if (current) p.openSheet(true);
        else void p.play(props, props.resumeAt, props.rate);
      }}
      className="relative flex h-12 w-full items-center gap-2.5 overflow-hidden rounded-lg border border-line bg-surface-2 px-3.5 text-left transition-colors hover:border-line-2"
    >
      <PlayIcon className="size-4 text-cyan" />
      <span className="text-body font-semibold text-text">{word}</span>
      <span className="font-mono text-small text-mute">{time}</span>
      {pct > 0 && <span aria-hidden className="absolute bottom-0 left-0 h-0.5 bg-cyan" style={{ width: `${pct}%` }} />}
    </button>
  );
}
