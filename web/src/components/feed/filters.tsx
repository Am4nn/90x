"use client";

import { Dialog } from "@base-ui/react/dialog";
import { Popover } from "@base-ui/react/popover";
import { useState } from "react";
import { useIsPhone } from "@/components/use-is-phone";
import { DIFFICULTY_PREFERENCES, type DifficultyPreference } from "@/lib/feed/difficulty";
import { AREA_DOT, AREA_LABEL, FEED_AREAS, type FeedArea } from "@/lib/feed/view";

// One summary pill in the Feed header. On a phone it opens a bottom sheet, on a wide
// screen a dropdown; both hold the same two controls: how hard the mix is, and which
// topics it draws from. Changes save as they are made and apply from the next card.

const LABEL: Record<DifficultyPreference, string> = { easier: "Easier", standard: "Standard", harder: "Harder" };
const NOTE: Record<DifficultyPreference, string> = {
  easier: "More easy cards in the mix, fewer hard ones.",
  standard: "The default mix for your level.",
  harder: "More hard cards in the mix, fewer easy ones.",
};
// Left to right reads easier to harder, the natural order for a scale.
const ORDER = DIFFICULTY_PREFERENCES.toReversed();

type Props = {
  areas: FeedArea[];
  difficulty: DifficultyPreference;
  pending: boolean;
  error: string | null;
  onAreasChange: (next: FeedArea[]) => void;
  onDifficultyChange: (next: DifficultyPreference) => void;
};

function summary(areas: FeedArea[], difficulty: DifficultyPreference) {
  const topics =
    areas.length === FEED_AREAS.length ? "All topics" : areas.length === 1 ? AREA_LABEL[areas[0] as FeedArea] : `${areas.length} topics`;
  return `${topics} · ${LABEL[difficulty]}`;
}

const PILL =
  "group flex h-10 items-center gap-2 rounded-full border border-line-2 pr-3 pl-3.5 text-small font-semibold whitespace-nowrap text-text data-[popup-open]:border-cyan data-[popup-open]:bg-cyan-bg";
const DONE = "flex-none rounded-lg bg-cyan font-bold text-on-cyan";

export function FeedFilters(props: Props) {
  const phone = useIsPhone();
  const [open, setOpen] = useState(false);
  const pill = <PillContent areas={props.areas} difficulty={props.difficulty} />;

  if (phone) {
    return (
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Trigger className={PILL}>{pill}</Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-40 bg-background/60 transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
          <Dialog.Popup className="pb-safe-nav fixed inset-x-0 bottom-0 z-50 flex max-h-5/6 flex-col gap-5 overflow-y-auto rounded-t-2xl border-t border-line-2 bg-surface px-5 pt-2.5 shadow-2xl transition-transform duration-300 ease-out outline-none data-[ending-style]:translate-y-full data-[starting-style]:translate-y-full">
            <span aria-hidden className="h-1 w-9 self-center rounded-full bg-line-2" />
            <div className="-mt-1.5 flex items-center justify-between">
              <Dialog.Title className="font-display text-heading font-semibold text-text">Tune your feed</Dialog.Title>
              <button
                type="button"
                onClick={() => {
                  props.onAreasChange([...FEED_AREAS]);
                  props.onDifficultyChange("standard");
                }}
                className="py-2 text-small font-semibold text-cyan"
              >
                Reset
              </button>
            </div>
            <FilterBody {...props} large />
            <Dialog.Close className={`${DONE} h-12 text-body`}>Done</Dialog.Close>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    );
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger className={PILL}>{pill}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={8} collisionPadding={16} className="z-50">
          <Popover.Popup className="flex w-96 flex-col gap-4.5 rounded-xl border border-line-2 bg-surface p-4.5 shadow-2xl outline-none">
            <FilterBody {...props} large={false} />
            <Popover.Close className={`${DONE} h-11 text-body`}>Done</Popover.Close>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

function PillContent({ areas, difficulty }: Pick<Props, "areas" | "difficulty">) {
  return (
    <>
      <span className="flex" aria-hidden>
        {FEED_AREAS.filter((area) => areas.includes(area)).map((area) => (
          <span key={area} className={`-ml-0.5 size-2 rounded-full border border-background ${AREA_DOT[area]}`} />
        ))}
      </span>
      <span>{summary(areas, difficulty)}</span>
      <svg
        viewBox="0 0 12 12"
        className="size-3 text-mute transition-transform group-data-[popup-open]:rotate-180"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M2.5 4.5 6 8l3.5-3.5" />
      </svg>
    </>
  );
}

function FilterBody({ areas, difficulty, pending, error, onAreasChange, onDifficultyChange, large }: Props & { large: boolean }) {
  const toggle = (area: FeedArea) => {
    if (areas.includes(area)) {
      if (areas.length === 1) return; // at least one stays on
      onAreasChange(areas.filter((a) => a !== area));
    } else {
      onAreasChange(FEED_AREAS.filter((a) => a === area || areas.includes(a)));
    }
  };

  return (
    <div className="flex flex-col gap-4.5" aria-busy={pending || undefined}>
      <section className="flex flex-col gap-2.5">
        <Eyebrow>Difficulty</Eyebrow>
        <div role="radiogroup" aria-label="Difficulty" className="grid grid-cols-3 rounded-lg border border-line bg-background p-0.75">
          {ORDER.map((option) => {
            const on = option === difficulty;
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => onDifficultyChange(option)}
                className={`rounded-md text-small font-bold ${large ? "h-10" : "h-9"} ${on ? "bg-cyan-bg text-cyan" : "text-text-2"}`}
              >
                {LABEL[option]}
              </button>
            );
          })}
        </div>
        <Note>{NOTE[difficulty]} Changes apply from the next card.</Note>
      </section>

      <section className="flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between">
          <Eyebrow>Topics</Eyebrow>
          {large ? (
            <span className="text-small font-medium text-mute">
              {areas.length} of {FEED_AREAS.length} on
            </span>
          ) : (
            <button type="button" onClick={() => onAreasChange([...FEED_AREAS])} className="text-small font-semibold text-cyan">
              Select all
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {FEED_AREAS.map((area) => {
            const on = areas.includes(area);
            return (
              <button
                key={area}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(area)}
                className={`flex items-center gap-2 rounded-full border px-3.5 text-small font-semibold ${large ? "h-10" : "h-9"} ${
                  on ? "border-cyan bg-cyan-bg text-text" : "border-line-2 text-mute"
                }`}
              >
                <span className={`size-2 rounded-full ${on ? AREA_DOT[area] : "bg-mute"}`} />
                {AREA_LABEL[area]}
              </button>
            );
          })}
        </div>
        <Note>Keep at least one on. Changes apply from the next card.</Note>
      </section>

      {error && (
        <p role="alert" className="text-small text-bad">
          {error}
        </p>
      )}
      {pending && !error && <p className="text-small text-mute">Saving…</p>}
    </div>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <span className="text-tag leading-none font-bold tracking-eyebrow text-mute uppercase">{children}</span>;
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="text-small font-medium text-mute">{children}</p>;
}
