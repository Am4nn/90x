"use client";

import { PauseIcon, PlayIcon, SpinnerIcon } from "@/components/icons";
import { formatTime } from "@/lib/audio/rules";
import { FullPlayer } from "./full-player";
import { usePlayer } from "./player-provider";

/** Above the tab bar on phones, at the foot of the sidebar on desktop.
 *  The title opens the full player; the square button plays and pauses. */
export function MiniPlayer({ placement }: { placement: "tabbar" | "sidebar" }) {
  const p = usePlayer();
  if (!p.track) return null;
  const pct = p.durationS > 0 ? Math.min(100, (p.positionS / p.durationS) * 100) : 0;
  const left = Math.max(0, p.durationS - p.positionS);
  const status = p.error ?? (p.loading ? "Loading…" : `${formatTime(p.positionS)} · ${formatTime(left)} left`);
  const toggle = (
    <button
      type="button"
      aria-label={p.loading ? "Loading" : p.playing ? "Pause" : "Play"}
      onClick={p.toggle}
      className={`inline-flex shrink-0 items-center justify-center bg-cyan-bg text-cyan ${placement === "tabbar" ? "size-11 rounded-xl" : "size-10 rounded-lg"}`}
    >
      {p.loading ? (
        <SpinnerIcon className="size-5 animate-spin motion-reduce:animate-none" />
      ) : p.playing ? (
        <PauseIcon className="size-5" />
      ) : (
        <PlayIcon className="size-5" />
      )}
    </button>
  );
  const title = (
    <button
      type="button"
      onClick={() => p.openSheet(true)}
      aria-label={`Open player, ${p.track.title}`}
      className="flex min-w-0 flex-1 flex-col gap-0.5 text-left"
    >
      <span className="truncate text-body font-semibold text-text">{p.track.title}</span>
      <span className={`text-tag ${p.error || p.loading ? "" : "font-mono"} text-mute`}>{status}</span>
    </button>
  );
  const bar = (
    <span aria-hidden className="block h-0.5 w-full bg-line-2">
      <span className={`block h-0.5 bg-cyan ${p.loading ? "opacity-40" : ""}`} style={{ width: `${pct}%` }} />
    </span>
  );

  if (placement === "tabbar") {
    return (
      <div data-testid="mini-player-tabbar" className="bottom-above-nav fixed inset-x-0 z-40 border-t border-line bg-surface md:hidden">
        <div className="absolute inset-x-0 -top-px">{bar}</div>
        <div className="flex h-15 items-center gap-3 pr-4 pl-5">
          {title}
          {toggle}
        </div>
        <FullPlayer />
      </div>
    );
  }
  return (
    <div
      data-testid="mini-player-sidebar"
      className="hidden flex-col gap-2.5 overflow-hidden rounded-xl border border-line bg-surface p-3 md:flex"
    >
      <div className="flex items-center gap-2.5">
        {title}
        {toggle}
      </div>
      {bar}
    </div>
  );
}
