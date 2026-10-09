"use client";

import { Dialog } from "@base-ui/react/dialog";
import { ChevronDownIcon, PauseIcon, PlayIcon, Skip15Icon } from "@/components/icons";
import { currentLine, formatTime, remaining, sections, SKIP_S } from "@/lib/audio/rules";
import { AREA_LABEL, AREA_TEXT } from "@/lib/feed/view";
import { DownloadButton } from "./download-button";
import { usePlayer } from "./player-provider";
import { SpeedPill } from "./speed-pill";
import { Transcript } from "./transcript";

const SECTION_LABEL: Record<string, string> = { intro: "Intro", walkthrough: "Walkthrough", pitfalls: "Pitfalls", recap: "Recap" };

/** The full player: a bottom sheet on phones, a right-hand panel on desktop. Opened from the
 *  mini-player; "Now playing" header, title and topic, a scrubber with section ticks, section chips, ±15 s
 *  around a large play button, the speed pill, then the transcript. */
export function FullPlayer() {
  const p = usePlayer();
  if (!p.track) return null;
  const { track } = p;
  const ticks = sections(track.lines);
  const now = currentLine(track.lines, p.positionS);
  const nowSection = now >= 0 ? track.lines[now]?.section : null;
  const pct = p.durationS > 0 ? Math.min(100, (p.positionS / p.durationS) * 100) : 0;
  return (
    <Dialog.Root open={p.sheetOpen} onOpenChange={p.openSheet}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-background/60 transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Popup className="pb-safe-nav fixed inset-x-0 bottom-0 z-50 flex max-h-11/12 flex-col gap-4.5 overflow-y-auto rounded-t-2xl border-t border-line bg-surface px-5 pt-2 shadow-2xl transition-transform duration-300 ease-out outline-none data-[ending-style]:translate-y-full data-[starting-style]:translate-y-full md:inset-y-0 md:right-0 md:left-auto md:max-h-none md:w-105 md:rounded-none md:border-t-0 md:border-l md:pt-6 md:data-[ending-style]:translate-x-full md:data-[ending-style]:translate-y-0 md:data-[starting-style]:translate-x-full md:data-[starting-style]:translate-y-0">
          <span aria-hidden className="h-1 w-9 self-center rounded-full bg-line-2 md:hidden" />
          <div className="-mx-2.5 -mt-1 flex items-center justify-between">
            <Dialog.Close
              aria-label="Collapse player"
              className="inline-flex size-11 items-center justify-center rounded-xl text-text-2 hover:bg-surface-2"
            >
              <ChevronDownIcon className="size-5.5 md:-rotate-90" />
            </Dialog.Close>
            <span className="text-tag font-semibold tracking-label text-mute">Now playing</span>
            <DownloadButton track={track} />
          </div>

          <div className="-mt-1 flex flex-col gap-2.5">
            <Dialog.Title className="font-display text-title font-bold text-text">{track.title}</Dialog.Title>
            {track.area && (
              <span
                className={`inline-flex h-6 items-center self-start rounded-lg border border-current px-2.5 text-tag font-semibold ${AREA_TEXT[track.area]}`}
              >
                {AREA_LABEL[track.area]}
              </span>
            )}
          </div>

          {p.error ? (
            <div role="alert" className="flex flex-col gap-3 rounded-xl border border-line-2 bg-surface-2 p-4">
              <span className="text-heading font-semibold text-text">{p.error}</span>
              <span className="text-small text-text-2">
                The audio didn&apos;t load. Check your connection and try again. You can keep reading the lesson.
              </span>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={p.retry}
                  className="inline-flex h-11 items-center rounded-lg bg-cyan-bg px-4 text-body font-semibold text-cyan"
                >
                  Retry
                </button>
                <Dialog.Close className="inline-flex h-11 items-center px-2 text-body font-semibold text-text-2">Read instead</Dialog.Close>
              </div>
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5 pt-1">
            <div className="relative flex h-6 items-center">
              {ticks.slice(1).map((t) => (
                <span
                  key={t.section}
                  aria-hidden
                  className="absolute top-1 h-4 w-px bg-line-2"
                  style={{ left: `${p.durationS > 0 ? (t.start_s / p.durationS) * 100 : 0}%` }}
                />
              ))}
              <span aria-hidden className="h-1 w-full rounded-full bg-line-2">
                <span className={`block h-1 rounded-full ${p.error ? "bg-mute" : "bg-cyan"}`} style={{ width: `${pct}%` }} />
              </span>
              {!p.error && <span aria-hidden className="absolute size-3.5 rounded-full bg-cyan" style={{ left: `calc(${pct}% - 7px)` }} />}
              {/* The real control: a native range on top, invisible, so dragging, keys and screen readers just work. */}
              <input
                type="range"
                min={0}
                max={Math.max(1, Math.floor(p.durationS))}
                step={1}
                value={Math.floor(p.positionS)}
                onChange={(e) => p.seek(Number(e.target.value))}
                aria-label="Position"
                aria-valuetext={`${formatTime(p.positionS)} of ${formatTime(p.durationS)}`}
                className="absolute inset-0 h-6 w-full cursor-pointer opacity-0"
              />
            </div>
            <div className="flex justify-between font-mono text-tag text-mute">
              <span>{formatTime(p.positionS)}</span>
              <span>{remaining(p.positionS, p.durationS)}</span>
            </div>
          </div>

          {ticks.length > 0 && (
            <div role="group" aria-label="Sections" className="flex flex-wrap gap-2">
              {ticks.map((t) => {
                const on = t.section === nowSection;
                return (
                  <button
                    key={t.section}
                    type="button"
                    onClick={() => p.seek(t.start_s)}
                    aria-current={on ? "true" : undefined}
                    className={`inline-flex h-8 items-center rounded-lg border px-3 text-small font-semibold ${on ? "border-cyan bg-cyan text-on-cyan" : "border-line-2 bg-surface-2 text-text-2"}`}
                  >
                    {SECTION_LABEL[t.section] ?? t.section}
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex items-center justify-center gap-8 py-1">
            <button
              type="button"
              aria-label={`Back ${SKIP_S} seconds`}
              onClick={() => p.skip(-SKIP_S)}
              className="inline-flex size-11 items-center justify-center rounded-xl text-text"
            >
              <Skip15Icon className="size-10" />
            </button>
            <button
              type="button"
              aria-label={p.playing ? "Pause" : "Play"}
              onClick={p.toggle}
              className="inline-flex size-18 items-center justify-center rounded-full bg-cyan text-on-cyan"
            >
              {p.playing ? <PauseIcon className="size-7.5" /> : <PlayIcon className="size-7.5" />}
            </button>
            <button
              type="button"
              aria-label={`Forward ${SKIP_S} seconds`}
              onClick={() => p.skip(SKIP_S)}
              className="inline-flex size-11 items-center justify-center rounded-xl text-text"
            >
              <Skip15Icon forward className="size-10" />
            </button>
          </div>

          <div className="flex justify-center">
            <SpeedPill rate={p.rate} onChange={p.setRate} />
          </div>

          <span aria-hidden className="h-px bg-line" />

          <Transcript lines={track.lines} positionS={p.positionS} onSeek={p.seek} />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
