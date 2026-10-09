"use client";

import { PlayIcon } from "@/components/icons";
import { TRY_LESSON } from "@/lib/landing/try-cards";

/** Under the card on a phone: the way to the lesson. It opens the Listen tab. */
export function ListenRow({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${TRY_LESSON.title}, the lesson, with audio, 7 minutes`}
      className="flex h-13 w-full items-center gap-2.5 rounded-lg border border-line bg-surface-2 px-3.5 text-left transition-colors hover:border-line-2 md:hidden"
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
