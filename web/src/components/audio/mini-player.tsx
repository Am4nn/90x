"use client";

import { CheckIcon, CloseIcon, PauseIcon, PlayIcon, SpinnerIcon } from "@/components/icons";
import { formatTime } from "@/lib/audio/rules";
import { FullPlayer } from "./full-player";
import { usePlayer } from "./player-provider";

/** Above the tab bar on phones, at the foot of the sidebar on desktop.
 *  The title opens the full player; the square button plays and pauses; × stops and closes the player. When
 *  the lesson ends it says Completed with Listen again for a moment, then goes (the provider's timer). */
export function MiniPlayer({ placement }: { placement: "tabbar" | "sidebar" }) {
  const p = usePlayer();
  if (!p.track) return null;
  const tab = placement === "tabbar";
  const pct = p.justFinished ? 100 : p.durationS > 0 ? Math.min(100, (p.positionS / p.durationS) * 100) : 0;
  const left = Math.max(0, p.durationS - p.positionS);
  const status = p.error ?? (p.loading ? "Loading…" : `${formatTime(p.positionS)} · ${formatTime(left)} left`);

  const bar = (
    <span aria-hidden className="block h-0.5 w-full bg-line-2">
      <span
        className={`block h-0.5 ${p.justFinished ? "bg-ok" : "bg-cyan"} ${p.loading ? "opacity-40" : ""}`}
        style={{ width: `${pct}%` }}
      />
    </span>
  );

  const row = p.justFinished ? (
    <>
      <span aria-hidden className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-ok/15 text-ok">
        <CheckIcon className="size-4" />
      </span>
      <span role="status" className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-body font-semibold text-text">Completed</span>
        <span className="truncate text-tag text-mute">{p.track.title}</span>
      </span>
      <button
        type="button"
        onClick={p.restart}
        className="inline-flex h-11 shrink-0 items-center rounded-lg px-2.5 text-small font-semibold text-cyan"
      >
        Listen again
      </button>
    </>
  ) : (
    <>
      <button
        type="button"
        onClick={() => p.openSheet(true)}
        aria-label={`Open player, ${p.track.title}`}
        className="flex min-w-0 flex-1 flex-col gap-0.5 text-left"
      >
        <span className="truncate text-body font-semibold text-text">{p.track.title}</span>
        <span className={`text-tag ${p.error || p.loading ? "" : "font-mono"} text-mute`}>{status}</span>
      </button>
      <button
        type="button"
        aria-label={p.loading ? "Loading" : p.playing ? "Pause" : "Play"}
        onClick={p.toggle}
        className={`inline-flex shrink-0 items-center justify-center bg-cyan-bg text-cyan ${tab ? "size-11 rounded-xl" : "size-10 rounded-lg"}`}
      >
        {p.loading ? (
          <SpinnerIcon className="size-5 animate-spin motion-reduce:animate-none" />
        ) : p.playing ? (
          <PauseIcon className="size-5" />
        ) : (
          <PlayIcon className="size-5" />
        )}
      </button>
      <button
        type="button"
        aria-label="Stop and close the player"
        onClick={p.stop}
        className={`inline-flex shrink-0 items-center justify-center rounded-lg text-mute hover:text-text-2 ${tab ? "size-11" : "-mr-1 size-8"}`}
      >
        <CloseIcon className={tab ? "size-4.5" : "size-4"} />
      </button>
    </>
  );

  if (tab) {
    return (
      <div data-testid="mini-player-tabbar" className="bottom-above-nav fixed inset-x-0 z-40 border-t border-line bg-surface md:hidden">
        <div className="absolute inset-x-0 -top-px">{bar}</div>
        <div className="flex h-15 items-center gap-2 pr-2 pl-5">{row}</div>
        <FullPlayer />
      </div>
    );
  }
  return (
    <div
      data-testid="mini-player-sidebar"
      className="hidden flex-col gap-2.5 overflow-hidden rounded-xl border border-line bg-surface p-3 md:flex"
    >
      <div className="flex items-center gap-2">{row}</div>
      {bar}
    </div>
  );
}
