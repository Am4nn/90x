"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PauseIcon, PlayIcon, TrashIcon } from "@/components/icons";
import { deleteDownload, type Downloaded, downloadedLessons } from "@/lib/audio/offline";
import { formatTime } from "@/lib/audio/rules";
import { AREA_LABEL, AREA_TEXT } from "@/lib/feed/view";
import { usePlayer } from "./player-provider";

const mb = (bytes: number) => `${(bytes / 1e6).toFixed(1)} MB`;

/** Settings, Downloaded lessons: each saved lesson with a play button (it plays
 *  from this device, so offline too), its topic, length and size, the title linking to the lesson, a bin to
 *  remove it, the total on this device, and Delete all. Read from this device's cache, so it renders on the client. */
export function DownloadedLessons() {
  const p = usePlayer();
  const [items, setItems] = useState<Downloaded[] | null>(null);
  useEffect(() => {
    void downloadedLessons().then(setItems);
  }, []);

  async function remove(keys: string[]) {
    // Removing the file that is playing stops it: the player would lose its source mid-lesson.
    if (p.track && keys.includes(p.track.r2Key)) p.stop();
    await Promise.all(keys.map((k) => deleteDownload(k)));
    setItems((prev) => (prev ?? []).filter((i) => !keys.includes(i.r2Key)));
  }

  function play(d: Downloaded) {
    if (p.track?.r2Key === d.r2Key) {
      p.toggle();
      return;
    }
    void p.play(
      { topicSlug: d.topicSlug, title: d.title, area: d.area ?? null, durationS: d.durationS ?? 0, lines: d.lines ?? [], r2Key: d.r2Key },
      0,
      p.rate,
    );
  }

  if (items === null) return <p className="text-small text-mute">Loading…</p>;
  if (items.length === 0) {
    return <p className="text-small text-mute">No downloads yet. Open a lesson&apos;s player and tap the download icon.</p>;
  }
  const total = items.reduce((n, d) => n + d.bytes, 0);
  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col rounded-xl border border-line bg-surface">
        {items.map((d) => {
          const current = p.track?.r2Key === d.r2Key;
          const playing = current && p.playing;
          return (
            <li key={d.r2Key} className="flex items-center gap-3 border-t border-line px-3 py-3 first:border-0">
              <button
                type="button"
                aria-label={`${playing ? "Pause" : "Play"} ${d.title}`}
                onClick={() => play(d)}
                className={`inline-flex size-11 shrink-0 items-center justify-center rounded-xl ${playing ? "bg-cyan text-on-cyan" : "bg-cyan-bg text-cyan"}`}
              >
                {playing ? <PauseIcon className="size-4.5" /> : <PlayIcon className="size-4.5" />}
              </button>
              <Link href={`/library/topic/${d.topicSlug}`} className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-body font-semibold text-text">{d.title}</span>
                <span className="text-small text-mute">
                  {d.area && <span className={AREA_TEXT[d.area]}>{AREA_LABEL[d.area]} · </span>}
                  {current ? (
                    <span className="font-mono text-cyan">
                      {playing ? "Playing" : "Paused"} {formatTime(p.positionS)} of {formatTime(p.durationS || d.durationS || 0)}
                    </span>
                  ) : (
                    <>
                      {d.durationS ? `${formatTime(d.durationS)} · ` : ""}
                      {mb(d.bytes)}
                    </>
                  )}
                </span>
              </Link>
              <button
                type="button"
                aria-label={`Delete ${d.title} download`}
                onClick={() => void remove([d.r2Key])}
                className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-mute hover:bg-surface-2 hover:text-bad"
              >
                <TrashIcon className="size-4.5" />
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center justify-between px-1">
        <span className="text-small text-text-2">
          {items.length} {items.length === 1 ? "lesson" : "lessons"} on this device
        </span>
        <span className="font-mono text-small text-text">{mb(total)}</span>
      </div>
      <button
        type="button"
        onClick={() => void remove(items.map((i) => i.r2Key))}
        className="inline-flex h-11 items-center self-start rounded-lg border border-line-2 bg-surface-2 px-4 text-body font-semibold text-text-2"
      >
        Delete all
      </button>
    </div>
  );
}
