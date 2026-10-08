"use client";

import { useCallback, useEffect, useState } from "react";
import { shareCodeAction, shareCountedAction } from "@/app/(app)/share/actions";
import { button } from "@/components/button-styles";
import { CopyIcon, ShareIcon } from "@/components/icons";
import { cardPath, inviteUrl, shareMode } from "@/lib/share/link";
import { copyLink, shareOrCopy } from "@/lib/share/share-flow";

type Ready = { link: string; png: string; file: File | null };

// The code and the card are fetched when this mounts, not on click: navigator.share only works
// inside the click's own user activation, and awaiting the server first loses it on Safari.
// A share sheet that went through, a copy or a download is counted for admin Analytics, silently
// (the rules are in lib/share/share-flow, with their tests).

const counted = () => void shareCountedAction().catch(() => {});
export function ShareDay({ dayNumber, origin, className = "" }: { dayNumber: number; origin: string; className?: string }) {
  const [ready, setReady] = useState<Ready | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const load = useCallback(
    async (live: () => boolean) => {
      try {
        const made = await shareCodeAction();
        if (!made.ok) {
          if (live()) setError(made.error);
          return;
        }
        // The server's own version of the card (the route 404s any other); none means the bare card.
        const png = cardPath(made.code, made.version ?? undefined);
        const blob = await fetch(png)
          .then((r) => (r.ok ? r.blob() : null))
          .catch(() => null);
        const file = blob ? new File([blob], `90x-day-${dayNumber}.png`, { type: "image/png" }) : null;
        if (live()) setReady({ link: inviteUrl(origin, made.code), png, file });
      } catch {
        if (live()) setError("Could not make your share link. Check your connection and try again.");
      }
    },
    [dayNumber, origin],
  );

  useEffect(() => {
    let live = true;
    (async () => {
      await load(() => live);
    })();
    return () => {
      live = false;
    };
  }, [load]);

  function retry() {
    setError(null);
    void load(() => true);
  }

  const copyNote = (outcome: string) => {
    if (outcome === "copied") setNote("Link copied.");
    else if (outcome === "not-copied") setNote("Select the link to copy it.");
  };

  async function copy(link: string) {
    copyNote(await copyLink({ copy: () => navigator.clipboard.writeText(link), counted }));
  }

  async function share() {
    if (!ready) return;
    setNote(null);
    const data = { text: `Day ${dayNumber} of my backend interview prep on 90x.`, url: ready.link };
    const { file, link } = ready;
    const outcome = await shareOrCopy({
      mode: shareMode(navigator, file),
      share: (withFile) => navigator.share(withFile && file ? { ...data, files: [file] } : data),
      copy: () => navigator.clipboard.writeText(link),
      counted,
    });
    copyNote(outcome);
  }

  return (
    <section aria-label="Share your day" className={`flex flex-col gap-3 rounded-lg border border-line bg-surface p-4 ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="font-display text-body font-semibold">Share your Day {dayNumber}</p>
        <button
          type="button"
          onClick={share}
          disabled={!ready}
          aria-busy={(!ready && !error) || undefined}
          className={button({ variant: "primary", size: "sm" })}
        >
          <ShareIcon className="size-4" />
          Share
        </button>
      </div>
      <div className="flex items-center gap-2 rounded-md border border-line bg-background py-1 pr-1 pl-3">
        <code data-testid="share-link" className="tabular min-w-0 flex-1 truncate font-sans text-small text-text-2">
          {ready ? ready.link.replace(/^https?:\/\//, "") : "Making your link"}
        </code>
        <button type="button" onClick={() => ready && copy(ready.link)} disabled={!ready} className={button({ size: "sm" })}>
          <CopyIcon className="size-4" />
          Copy
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-tag text-mute">
        <p>
          No share sheet on this device? Copy the link, or{" "}
          {ready ? (
            <a
              href={ready.png}
              download={`90x-day-${dayNumber}.png`}
              onClick={counted}
              className="text-text-2 underline underline-offset-2"
            >
              download the card as a PNG
            </a>
          ) : (
            "download the card as a PNG"
          )}
          .
        </p>
        <p role="status">{error ?? note}</p>
        {error && (
          <button type="button" onClick={retry} className={button({ size: "sm" })}>
            Try again
          </button>
        )}
      </div>
    </section>
  );
}
