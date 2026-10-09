"use client";

import { Popover } from "@base-ui/react/popover";
import { useEffect, useState } from "react";
import { audioUrl } from "@/app/actions/audio";
import { DownloadedIcon, DownloadIcon } from "@/components/icons";
import { deleteDownload, downloadLesson, isDownloaded } from "@/lib/audio/offline";
import type { Track } from "./player-provider";

const RING = 2 * Math.PI * 9; // the progress ring's circumference (r = 9 in a 24 box)
const ICON = "inline-flex size-11 items-center justify-center rounded-xl text-text-2 hover:bg-surface-2";

/** The full player's top-bar icon: download for offline, a progress ring while saving, a
 *  green check once saved. A tap opens a small card that confirms the download or removes it. */
export function DownloadButton({ track }: { track: Track }) {
  const [state, setState] = useState<"unknown" | "no" | "busy" | "yes">("unknown");
  const [share, setShare] = useState(0);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    void isDownloaded(track.r2Key).then((yes) => setState(yes ? "yes" : "no"));
  }, [track.r2Key]);

  async function download() {
    setOpen(false);
    setShare(0);
    setState("busy");
    // The e2e build has no bucket: it saves its local tone instead (ci.yml). Never set in Vercel.
    const e2e = process.env.NEXT_PUBLIC_E2E_AUDIO_SRC;
    // Offline, the action rejects: treat it as no URL so the button returns to Download, not a stuck ring.
    const result = e2e ? { url: e2e } : await audioUrl(track.topicSlug).catch(() => ({ error: "unavailable" as const }));
    const saved =
      "url" in result
        ? await downloadLesson(
            {
              r2Key: track.r2Key,
              topicSlug: track.topicSlug,
              title: track.title,
              signedUrl: result.url,
              area: track.area,
              durationS: track.durationS,
            },
            setShare,
          )
        : null;
    setState(saved ? "yes" : "no");
  }
  async function remove() {
    setOpen(false);
    await deleteDownload(track.r2Key);
    setState("no");
  }

  // No worker or no storage: nothing to offer, but the header keeps its balance.
  if (state === "unknown") return <span aria-hidden className="size-11" />;
  if (state === "busy") {
    const pct = Math.round(share * 100);
    return (
      <span role="status" aria-label={`Downloading, ${pct} percent`} className={ICON}>
        <svg viewBox="0 0 24 24" className="size-5.5" fill="none" strokeWidth={2} strokeLinecap="round" aria-hidden>
          <circle cx="12" cy="12" r="9" className="stroke-line-2" />
          <circle
            cx="12"
            cy="12"
            r="9"
            className="stroke-cyan"
            strokeDasharray={RING}
            strokeDashoffset={RING * (1 - share)}
            transform="rotate(-90 12 12)"
          />
        </svg>
      </span>
    );
  }
  const saved = state === "yes";
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger aria-label={saved ? "Downloaded. Remove download" : "Download for offline"} className={ICON}>
        {saved ? <DownloadedIcon className="size-5.5 text-ok" /> : <DownloadIcon className="size-5.5" />}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={8} collisionPadding={16} className="z-50">
          <Popover.Popup className="flex w-60 flex-col gap-3 rounded-xl border border-line-2 bg-surface-2 p-3.5 shadow-2xl outline-none">
            <Popover.Title className="text-body font-semibold text-text">{saved ? "Saved for offline" : "Save for offline"}</Popover.Title>
            <Popover.Description className="text-small text-text-2">
              {saved ? "Plays without a connection. Remove it to free the space." : "Plays without a connection."}
            </Popover.Description>
            <button
              type="button"
              onClick={() => void (saved ? remove() : download())}
              className="inline-flex h-10 items-center self-start rounded-lg bg-cyan-bg px-3.5 text-body font-semibold text-cyan"
            >
              {saved ? "Remove download" : "Download"}
            </button>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
