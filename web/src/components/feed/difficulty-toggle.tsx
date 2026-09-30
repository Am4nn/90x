"use client";

import { Popover } from "@base-ui/react/popover";
import { chip } from "@/components/button-styles";
import { type DifficultyPreference } from "@/lib/feed/difficulty";

const LABEL: Record<DifficultyPreference, string> = {
  easier: "Easier",
  standard: "Standard",
  harder: "Harder",
};

// Left to right reads easier → harder, the natural order for a scale.
const ORDER: DifficultyPreference[] = ["easier", "standard", "harder"];

/** Header action: how the Feed mixes difficulties. It shifts the mix, never
 *  filters it — no card becomes unreachable and FSRS scheduling is untouched. */
export function DifficultyToggle({
  preference,
  pending,
  error,
  onSelect,
}: {
  preference: DifficultyPreference;
  pending: boolean;
  error: string | null;
  onSelect: (preference: DifficultyPreference) => void;
}) {
  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label="Feed difficulty"
        className="grid size-9 place-items-center rounded-lg border border-line text-text-2 hover:text-text data-[popup-open]:border-line-2 data-[popup-open]:text-text"
      >
        <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
          <path d="M3.5 14a6.5 6.5 0 0 1 13 0" />
          <path d="M10 14l3-4.5" />
          <circle cx="10" cy="14" r="1.2" />
        </svg>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={8} align="end" className="z-50">
          <Popover.Popup className="flex w-72 flex-col gap-3 rounded-xl border border-line-2 bg-surface p-4 shadow-xl outline-none">
            <Popover.Title className="font-display text-heading font-semibold">Difficulty</Popover.Title>
            <div className="flex flex-wrap gap-2" aria-busy={pending || undefined}>
              {ORDER.map((option) => {
                const on = preference === option;
                return (
                  <button key={option} type="button" aria-pressed={on} onClick={() => onSelect(option)} className={chip(on)}>
                    {LABEL[option]}
                  </button>
                );
              })}
            </div>
            {error ? (
              <p role="alert" className="text-small text-bad">
                {error}
              </p>
            ) : (
              <p className="text-small text-mute">
                {pending ? "Saving…" : "Shifts the mix, never removes cards. Changes apply from the next card."}
              </p>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
