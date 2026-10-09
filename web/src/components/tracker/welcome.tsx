"use client";

import { Dialog } from "@base-ui/react/dialog";
import { useEffect, useRef, useState, useTransition } from "react";
import { welcomeSeenAction } from "@/app/actions/welcome";
import { Ren } from "@/components/coach/ren";
import { hours, SLOT_MINUTES } from "@/lib/tracker/template";
import type { BarPart } from "@/lib/tracker/welcome";

// The first-run welcome: one page over Today, shown once after Set up.
// It says how every day is picked and ends with a hold
// to commit; Today's demo tips follow it. Skip, Escape and the hold all close it for
// good (profiles.welcome_seen_at).

const HOLD_MS = 900;

const STEPS = [
  { key: "review", title: "Reviews due", line: "What you missed, back on time" },
  { key: "new_problem", title: "Your weakest pattern", line: "New problems, weakest first" },
  { key: "topic", title: "Your weakest area", line: "One topic to read" },
  { key: "cards", title: "10 cards", line: "Quick recall, every day" },
] as const;

const SWATCH: Record<BarPart["key"], string> = {
  review: "bg-topic-dsa/45",
  new_problem: "bg-topic-dsa",
  topic: "bg-topic-sd",
  cards: "bg-cyan",
  free: "bg-line-2",
};

const KICKER = "text-tag font-bold tracking-eyebrow text-cyan uppercase";
const TITLE = "-mt-2 font-display text-title font-semibold tracking-title text-text";

export type WelcomeProps = { bar: BarPart[]; budget: number | null; everyDay: boolean };
type Props = WelcomeProps & {
  /** Fires once when the welcome closes, for any reason (Today then starts its demo). */
  onClosed?: () => void;
};

export function Welcome(props: Props) {
  const [open, setOpen] = useState(true);
  const [, startTransition] = useTransition();
  // Focus lands on the sheet itself, so Skip does not open wearing a focus ring.
  const popup = useRef<HTMLDivElement>(null);

  function close() {
    if (!open) return;
    setOpen(false);
    props.onClosed?.();
    startTransition(() => welcomeSeenAction());
  }

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && close()} disablePointerDismissal>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-background/75 transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Popup
          ref={popup}
          initialFocus={popup}
          // Today's demo takes focus as the welcome closes; returning it to the page would take it back.
          finalFocus={false}
          data-testid="welcome"
          className="fixed inset-x-0 top-19 bottom-0 z-50 flex flex-col gap-4.5 overflow-y-auto rounded-t-2xl border-t border-line-2 bg-surface-2 px-5 pt-2.5 pb-[calc(env(safe-area-inset-bottom,0px)+28px)] shadow-2xl transition-transform duration-300 ease-out outline-none data-[ending-style]:translate-y-full data-[starting-style]:translate-y-full md:inset-auto md:top-1/2 md:left-1/2 md:max-h-11/12 md:w-100 md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl md:border md:pb-7 md:data-[ending-style]:translate-y-[-45%] md:data-[ending-style]:opacity-0 md:data-[starting-style]:translate-y-[-45%] md:data-[starting-style]:opacity-0"
        >
          <span aria-hidden className="h-1 w-9 self-center rounded-full bg-line-2 md:hidden" />
          <div className="-mt-1 flex h-6 items-center justify-end">
            <button type="button" onClick={close} className="-mr-2 h-9 px-2 text-small font-semibold text-mute hover:text-text">
              Skip
            </button>
          </div>
          <HowPicked {...props} onDone={close} />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function HowPicked({ bar, budget, everyDay, onDone }: Props & { onDone: () => void }) {
  return (
    <>
      <div className="flex items-center gap-2.5">
        <Ren size={28} />
        <span className={KICKER}>Not a fixed sheet</span>
      </div>
      <Dialog.Title className={TITLE}>Your coach curates every day</Dialog.Title>
      <Dialog.Description className="-mt-2.5 text-text-2">
        Ren reads your progress each morning, then fills your day in this order.
      </Dialog.Description>
      <ol className="rounded-2xl border border-line bg-surface">
        {STEPS.map((s, i) => (
          <li key={s.key} className="grid grid-cols-[28px_1fr_auto] items-center gap-3 border-t border-line px-3.5 py-3 first:border-t-0">
            <span className="tabular grid size-7 place-items-center rounded-full border border-line-2 font-display text-small font-semibold text-text-2">
              {i + 1}
            </span>
            <div className="flex flex-col">
              <b className="leading-snug font-semibold text-text">{s.title}</b>
              <span className="text-small text-mute">{s.line}</span>
            </div>
            <span className="tabular flex items-center gap-1.5 text-small font-semibold text-text-2">
              <i aria-hidden className={`size-2 rounded-[3px] ${SWATCH[s.key]}`} />
              {SLOT_MINUTES[s.key]}m
            </span>
          </li>
        ))}
      </ol>
      {budget != null && (
        <div className="flex flex-col gap-2">
          <div className="flex justify-between text-small text-mute">
            <span>
              Sized to <b className="font-semibold text-text">{everyDay ? `${hours(budget)} a day` : `${hours(budget)} today`}</b>
            </span>
            <span>change in Me</span>
          </div>
          <div className="flex h-2.5 gap-0.75" aria-hidden>
            {bar.map((p) => (
              <i key={p.key} className={`rounded-[3px] ${SWATCH[p.key]}`} style={{ flexGrow: p.minutes }} />
            ))}
          </div>
        </div>
      )}
      <div className="flex-1" />
      <Hold onDone={onDone} />
      <p className="-mt-2.5 text-center text-tag leading-normal text-mute">Day 1 of 90 starts now</p>
    </>
  );
}

/** Press and hold to commit. A click with no pointer (keyboard, screen reader) commits at once. */
function Hold({ onDone }: { onDone: () => void }) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  function start() {
    setHolding(true);
    timer.current = setTimeout(onDone, HOLD_MS);
  }
  function stop() {
    clearTimeout(timer.current);
    setHolding(false);
  }

  return (
    <button
      type="button"
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onBlur={stop}
      onClick={(e) => e.detail === 0 && onDone()}
      onContextMenu={(e) => e.preventDefault()}
      className="relative grid h-14 shrink-0 touch-none place-items-center overflow-hidden rounded-xl border border-cyan font-bold text-cyan select-none"
    >
      <i
        aria-hidden
        className="absolute inset-y-0 left-0 bg-cyan/20"
        style={{ width: holding ? "100%" : "0%", transition: `width ${holding ? HOLD_MS : 200}ms linear` }}
      />
      <span className="relative">Hold: I&apos;m in</span>
    </button>
  );
}
