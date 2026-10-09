"use client";

import { CheckIcon, PlayIcon, ReplayIcon } from "@/components/icons";
import { formatTime, listenWord, type Speed, type TimedLine } from "@/lib/audio/rules";
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
  /** Heard to the end on an earlier visit (lesson_audio_progress.finished_at). */
  finished: boolean;
  rate: Speed;
};

/** On desktop, starting a lesson opens the Now playing panel; phones keep reading the lesson
 *  with the bottom bar, as before. */
const wide = () => window.matchMedia("(min-width: 768px)").matches;

/** The listen bar under the lesson title: Listen with the length, or
 *  Resume with "3:12 of 5:53" and a thin progress line. When this lesson is already in the player it reads
 *  Playing or Paused and opens the full player instead of starting over. A lesson heard to the end reads
 *  Completed with Listen again, which starts from 0:00. */
export function ListenButton(props: Props) {
  const p = usePlayer();
  const current = p.track?.topicSlug === props.topicSlug;
  const at = current ? p.positionS : props.resumeAt;
  const word = listenWord({
    current,
    playing: p.playing,
    positionS: p.positionS,
    durationS: p.durationS || props.durationS,
    finished: props.finished || p.finishedSlugs.includes(props.topicSlug),
    resumeAt: props.resumeAt,
  });
  const done = word === "Completed";
  const time = done
    ? formatTime(props.durationS)
    : at > 0
      ? `${formatTime(at)} of ${formatTime(props.durationS)}`
      : formatTime(props.durationS);
  const pct = done ? 100 : props.durationS > 0 && at > 0 ? Math.min(100, (at / props.durationS) * 100) : 0;
  const label =
    word === "Listen"
      ? `Listen, ${formatTime(props.durationS)}`
      : word === "Resume"
        ? `Resume from ${formatTime(at)}`
        : done
          ? "Completed. Listen again from the start"
          : `${word}, open the player`;

  function start(from: number) {
    if (wide()) p.openSheet(true);
    void p.play(props, from, props.rate);
  }

  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => {
        if (done) {
          if (current) {
            p.restart();
            if (wide()) p.openSheet(true);
          } else start(0);
        } else if (current) p.openSheet(true);
        else start(props.resumeAt);
      }}
      className={`relative flex h-12 w-full items-center gap-2.5 overflow-hidden rounded-lg border bg-surface-2 px-3.5 text-left transition-colors ${done ? "border-ok/30 hover:border-ok/50" : "border-line hover:border-line-2"}`}
    >
      {done ? <CheckIcon className="size-4 text-ok" /> : <PlayIcon className="size-4 text-cyan" />}
      <span className="text-body font-semibold text-text">{word}</span>
      <span className="font-mono text-small text-mute">{time}</span>
      {done && (
        <span className="ml-auto inline-flex items-center gap-1.5 text-small font-semibold text-cyan">
          <ReplayIcon className="size-3.5" />
          Listen again
        </span>
      )}
      {pct > 0 && (
        <span aria-hidden className={`absolute bottom-0 left-0 h-0.5 ${done ? "bg-ok" : "bg-cyan"}`} style={{ width: `${pct}%` }} />
      )}
    </button>
  );
}
