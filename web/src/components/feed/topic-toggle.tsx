"use client";

import { Popover } from "@base-ui/react/popover";
import { areaDot } from "@/lib/admin/review";
import { AREA_LABEL, FEED_AREAS, type FeedArea } from "@/lib/feed/view";

/** Header action: which areas the Feed draws from. At least one stays on. */
export function TopicToggle({
  areas,
  pending,
  error,
  onToggle,
}: {
  areas: FeedArea[];
  pending: boolean;
  error: string | null;
  onToggle: (area: FeedArea) => void;
}) {
  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label="Feed topics"
        className="grid size-9 place-items-center rounded-lg border border-line text-text-2 hover:text-text data-[popup-open]:border-line-2 data-[popup-open]:text-text"
      >
        <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
          <path d="M4 6h8M4 10h12M4 14h6" />
          <circle cx="15" cy="6" r="1.6" />
          <circle cx="13" cy="14" r="1.6" />
        </svg>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={8} align="end" className="z-50">
          <Popover.Popup className="flex w-72 flex-col gap-3 rounded-xl border border-line-2 bg-surface p-4 shadow-xl outline-none">
            <Popover.Title className="font-display text-heading font-semibold">Topics</Popover.Title>
            <div className="flex flex-wrap gap-2" aria-busy={pending || undefined}>
              {FEED_AREAS.map((area) => {
                const on = areas.includes(area);
                const last = on && areas.length === 1;
                return (
                  <button
                    key={area}
                    type="button"
                    aria-pressed={on}
                    disabled={last}
                    title={last ? "Keep at least one topic on" : undefined}
                    onClick={() => onToggle(area)}
                    className={`flex h-9 items-center gap-2 rounded-full border px-3.5 text-small font-semibold transition-colors ${on ? "border-cyan bg-cyan-bg text-text" : "border-line-2 text-mute hover:text-text-2"}`}
                  >
                    <span className={`size-2 rounded-full ${on ? areaDot(area) : "bg-line-2"}`} />
                    {AREA_LABEL[area]}
                  </button>
                );
              })}
            </div>
            {error ? (
              <p role="alert" className="text-small text-bad">
                {error}
              </p>
            ) : (
              <p className="text-small text-mute">{pending ? "Saving…" : "Keep at least one on. Changes apply from the next card."}</p>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
