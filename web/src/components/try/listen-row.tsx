"use client";

import { PauseIcon, PlayIcon } from "@/components/icons";
import { remaining } from "@/lib/audio/rules";
import { TRY_LESSON } from "@/lib/landing/try-cards";
import type { NowPlaying } from "@/lib/try/player-rules";

const WORD = { playing: "Playing", paused: "Paused", finished: "Finished" } as const;

/**
 * Under the card on a phone: the way to the lesson, which opens the Listen tab. Once the lesson has started in this
 * visit it is a live mini player, as the app's (components/audio/mini-player.tsx): its own play/pause button for the
 * one audio element, and the rest of the row still opens Listen. Two buttons side by side, never nested.
 */
export function ListenRow({ now, onOpen, onToggle }: { now: NowPlaying; onOpen: () => void; onToggle: () => void }) {
  if (now.status === "idle") {
    return (
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${TRY_LESSON.title}, the lesson, with audio, 7 minutes`}
        className="flex h-14 w-full items-center gap-2.5 rounded-lg border border-line bg-surface-2 px-3.5 text-left transition-colors hover:border-line-2 md:hidden"
      >
        <PlayIcon className="size-4 text-cyan" />
        <span className="flex min-w-0 flex-col">
          <span className="text-body font-semibold text-text">{TRY_LESSON.title}</span>
          <span className="text-tag text-mute">The lesson, with audio</span>
        </span>
        <span className="ml-auto font-mono text-small text-mute">{TRY_LESSON.durationText}</span>
      </button>
    );
  }
  const playing = now.status === "playing";
  const word = WORD[now.status];
  return (
    <div
      data-try="mini"
      className="flex h-14 w-full items-center rounded-lg border border-line bg-surface-2 pl-2 transition-colors hover:border-line-2 md:hidden"
    >
      <button
        type="button"
        onClick={onToggle}
        aria-label={playing ? "Pause the lesson" : "Play the lesson"}
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-cyan-bg text-cyan"
      >
        {playing ? <PauseIcon className="size-5" /> : <PlayIcon className="size-5" />}
      </button>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${TRY_LESSON.title}, ${word.toLowerCase()}, open the lesson`}
        className="flex h-full min-w-0 flex-1 flex-col justify-center gap-0.5 pr-3.5 pl-2.5 text-left"
      >
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-body font-semibold text-text">{TRY_LESSON.title}</span>
          {now.durationS > 0 && <span className="shrink-0 font-mono text-small text-mute">{remaining(now.positionS, now.durationS)}</span>}
        </span>
        <span className="text-tag text-mute">{`${word} · tap to open`}</span>
      </button>
    </div>
  );
}
