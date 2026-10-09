"use client";

import { useEffect, useState } from "react";
import { deleteDownload, type Downloaded, downloadedLessons } from "@/lib/audio/offline";
import { formatTime } from "@/lib/audio/rules";
import { AREA_LABEL, AREA_TEXT } from "@/lib/feed/view";

const mb = (bytes: number) => `${(bytes / 1e6).toFixed(1)} MB`;

/** Settings, Downloaded lessons: each saved lesson with its topic, length and size, a Delete on
 *  each, the total on this device, and Delete all. Read from this device's cache, so it renders on the client. */
export function DownloadedLessons() {
  const [items, setItems] = useState<Downloaded[] | null>(null);
  useEffect(() => {
    void downloadedLessons().then(setItems);
  }, []);

  async function remove(keys: string[]) {
    await Promise.all(keys.map((k) => deleteDownload(k)));
    setItems((prev) => (prev ?? []).filter((i) => !keys.includes(i.r2Key)));
  }

  if (items === null) return <p className="text-small text-mute">Loading…</p>;
  if (items.length === 0) {
    return <p className="text-small text-mute">No downloads yet. Open a lesson&apos;s player and tap the download icon.</p>;
  }
  const total = items.reduce((n, d) => n + d.bytes, 0);
  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col rounded-xl border border-line bg-surface">
        {items.map((d) => (
          <li key={d.r2Key} className="flex items-center justify-between gap-3 border-t border-line px-4 py-3.5 first:border-0">
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-body font-semibold text-text">{d.title}</span>
              <span className="text-small text-mute">
                {d.area && <span className={AREA_TEXT[d.area]}>{AREA_LABEL[d.area]} · </span>}
                {d.durationS ? `${formatTime(d.durationS)} · ` : ""}
                {mb(d.bytes)}
              </span>
            </span>
            <button
              type="button"
              aria-label={`Delete ${d.title} download`}
              onClick={() => void remove([d.r2Key])}
              className="inline-flex h-11 shrink-0 items-center rounded-lg px-3 text-small font-semibold text-bad hover:bg-surface-2"
            >
              Delete
            </button>
          </li>
        ))}
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
