"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { tipsSeenAction } from "@/app/actions/tips";
import { type Anchor, AUDIO_LESSON, DEMO, type TipId } from "@/lib/tips";

// The first-visit demo: one card at a time over Today, pointing at real controls
// (data-tip anchors). The page dims through an SVG mask with a hole per anchor, so the
// ringed controls stay bright. Any way out (Skip, Done, Listen to one, Escape) ends it
// for good.

type Box = { x: number; y: number; w: number; h: number };
const PAD = 6;

/** The on-screen anchor named `name`: the visible one (the tab bar on phones, the sidebar on desktop). */
function anchorBox(name: Anchor): Box | null {
  for (const el of document.querySelectorAll<HTMLElement>(`[data-tip="${name}"]`)) {
    const r = el.getBoundingClientRect();
    if (r.width && r.height) return { x: r.left - PAD, y: r.top - PAD, w: r.width + PAD * 2, h: r.height + PAD * 2 };
  }
  return null;
}

type Layout = { boxes: Box[]; vw: number; vh: number };

/** Re-measure on resize, scroll (any scroller) and any change to the page's size (content streaming in). */
function subscribe(onChange: () => void) {
  window.addEventListener("resize", onChange);
  window.addEventListener("scroll", onChange, true);
  const observer = new ResizeObserver(onChange);
  observer.observe(document.body);
  return () => {
    window.removeEventListener("resize", onChange);
    window.removeEventListener("scroll", onChange, true);
    observer.disconnect();
  };
}

/** The anchors' boxes and the viewport. The snapshot is a string, so an unchanged layout is the same value. */
function useLayout(anchors: readonly Anchor[]): Layout | null {
  const snapshot = useSyncExternalStore(
    subscribe,
    () =>
      JSON.stringify({
        boxes: anchors.map(anchorBox).filter((b): b is Box => b !== null),
        vw: window.innerWidth,
        vh: window.innerHeight,
      } satisfies Layout),
    () => "",
  );
  return snapshot ? (JSON.parse(snapshot) as Layout) : null;
}

const NO_ANCHORS: readonly Anchor[] = [];

const ARROW_UP = <path d="M7 17L17 7M9 7h8v8" />;
const ARROW_DOWN = <path d="M7 7l10 10M17 9v8H9" />;
const BTN = "inline-flex h-11 items-center justify-center rounded-xl px-4 text-small font-bold md:h-9 md:rounded-lg";
const CARD_W = 300;
const GAP = 14;
const EDGE = 16;

export function Demo({ steps: initial }: { steps: TipId[] }) {
  // Frozen for the life of the demo: step 1 is stored as seen once shown, so a fresh
  // server render mid-demo would otherwise drop it and renumber the open card.
  const [steps] = useState(initial);
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(true);
  const [, start] = useTransition();
  const titleId = useId();
  // Focus moves to each step's card as it mounts (the card is keyed by step), and stays
  // in it while the demo is open: the dim covers the page, so the page can't be used.
  const cardEl = useRef<HTMLDivElement | null>(null);
  const focusCard = useCallback((el: HTMLDivElement | null) => {
    cardEl.current = el;
    el?.focus();
  }, []);
  const step = DEMO.find((s) => s.id === steps[index]);
  const layout = useLayout(step?.anchors ?? NO_ANCHORS);

  const end = useCallback(() => {
    setOpen(false);
    start(() => tipsSeenAction(steps));
    // Back to the page, on the first control the demo named.
    document.querySelector<HTMLElement>('[data-tip="plan"]')?.focus();
  }, [steps]);
  const next = () => (index + 1 < steps.length ? setIndex(index + 1) : end());
  // A step counts as seen once it is shown, so leaving at once (Listen to one navigates,
  // a reload) can't cut the save short and bring it back next visit.
  const shownId = step?.id;
  useEffect(() => {
    if (shownId) start(() => tipsSeenAction([shownId]));
  }, [shownId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return end();
      if (e.key !== "Tab" || !cardEl.current) return;
      // Tab cycles through the card's own buttons.
      const items = [...cardEl.current.querySelectorAll<HTMLElement>("button, a[href]")];
      const first = items[0];
      const last = items.at(-1);
      if (!first || !last) return;
      const inside = cardEl.current.contains(document.activeElement);
      if (e.shiftKey && (!inside || document.activeElement === first || document.activeElement === cardEl.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (!inside || document.activeElement === last)) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [end]);

  if (!open || !layout || !step) return null;
  const { boxes, vw, vh } = layout;
  const last = index === steps.length - 1;
  const w = Math.min(CARD_W, vw - EDGE * 2);

  // Two anchors: the card sits in the middle and its lines say which is which. One anchor:
  // the card sits above it (a tab), or to its right (a sidebar item), with an arrow toward it.
  const one = boxes.length === 1 ? (boxes[0] ?? null) : null;
  const beside = one !== null && one.x + one.w < vw / 3 && one.y + one.h < vh - 120;
  const left =
    one && !beside
      ? Math.min(Math.max(EDGE, one.x + one.w / 2 - w / 2), vw - w - EDGE)
      : beside && one
        ? one.x + one.w + GAP
        : (vw - w) / 2;
  const place: React.CSSProperties = !one
    ? { left, top: Math.max(EDGE, vh / 2 - 110), width: w }
    : beside
      ? { left, top: Math.max(EDGE, one.y + one.h / 2 - 60), width: w }
      : { left, bottom: vh - one.y + GAP, width: w };
  const arrowX = one && !beside ? one.x + one.w / 2 - left - 6 : 0;

  return (
    <div data-testid="demo">
      <svg aria-hidden className="fixed inset-0 z-50 size-full">
        <defs>
          <mask id={`${titleId}-holes`}>
            <rect width="100%" height="100%" fill="white" />
            {boxes.map((b) => (
              <rect key={`${b.x},${b.y}`} x={b.x} y={b.y} width={b.w} height={b.h} rx="14" fill="black" />
            ))}
          </mask>
        </defs>
        <rect width="100%" height="100%" className="fill-background/75" mask={`url(#${titleId}-holes)`} />
      </svg>
      {boxes.map((b) => (
        <div
          key={`${b.x},${b.y}`}
          aria-hidden
          data-testid="demo-ring"
          className="pointer-events-none fixed z-50 rounded-2xl ring-2 ring-cyan"
          style={{ left: b.x, top: b.y, width: b.w, height: b.h }}
        />
      ))}
      <div
        key={step.id}
        ref={focusCard}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="fixed z-50 flex flex-col gap-2 rounded-2xl border border-line-2 bg-surface-2 p-4 shadow-2xl outline-none motion-safe:animate-in motion-safe:fade-in"
        style={place}
      >
        <div className="flex h-5 items-center justify-between text-tag font-bold text-mute">
          <span>
            {index + 1} of {steps.length}
          </span>
          {!last && (
            <button type="button" onClick={end} className="-my-3 -mr-2 h-11 px-2 hover:text-text md:-my-2 md:h-9">
              Skip
            </button>
          )}
        </div>
        {step.id === "plan-me" ? (
          <>
            <b id={titleId} className="font-display text-heading font-semibold text-text">
              Your plan and settings
            </b>
            <ul className="flex flex-col gap-2.5 text-small text-text-2">
              <li className="flex items-start gap-2">
                <Mark d={ARROW_UP} />
                <span>
                  <b className="font-semibold text-text">Plan</b>, top right: your daily time and the days you study.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Mark d={ARROW_DOWN} />
                <span>
                  <b className="font-semibold text-text">Me</b>
                  <span className="md:hidden">, bottom right</span>
                  <span className="hidden md:inline">, in the sidebar</span>: time zone, LeetCode and notifications.
                </span>
              </li>
            </ul>
          </>
        ) : (
          <>
            <b id={titleId} className="font-display text-heading font-semibold text-text">
              Lessons you can listen to
            </b>
            <p className="text-small text-text-2">Some lessons have audio, with more on the way. Look for Listen on a lesson.</p>
          </>
        )}
        <div className="mt-1 flex items-center justify-end gap-2">
          {step.id === "audio" ? (
            <>
              <button type="button" onClick={end} className={`${BTN} border border-line-2 text-text-2 hover:text-text`}>
                Done
              </button>
              <Link href={AUDIO_LESSON} onClick={end} className={`${BTN} bg-cyan text-on-cyan hover:bg-cyan/90`}>
                Listen to one
              </Link>
            </>
          ) : (
            <button type="button" onClick={next} className={`${BTN} bg-cyan text-on-cyan hover:bg-cyan/90`}>
              Next
            </button>
          )}
        </div>
        {one && !beside && (
          <i
            aria-hidden
            className="absolute -bottom-1.5 size-3 rotate-45 border-r border-b border-line-2 bg-surface-2"
            style={{ left: arrowX }}
          />
        )}
        {one && beside && (
          <i
            aria-hidden
            className="absolute -left-1.5 size-3 rotate-45 border-b border-l border-line-2 bg-surface-2"
            style={{ top: one.y + one.h / 2 - (place.top as number) - 6 }}
          />
        )}
      </div>
    </div>
  );
}

function Mark({ d }: { d: React.ReactNode }) {
  return (
    <span aria-hidden className="grid size-5.5 shrink-0 place-items-center rounded-md bg-cyan-bg text-cyan">
      <svg
        viewBox="0 0 24 24"
        className="size-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {d}
      </svg>
    </span>
  );
}
