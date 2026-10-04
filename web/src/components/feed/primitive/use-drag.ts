"use client";

import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef, useState } from "react";
import { type Side, scrollDirection, sideOf } from "@/lib/feed/drag";

// Dragging is an addition to tapping, never a replacement: every primitive keeps
// its tap path. Pointer Events rather than HTML5 drag-and-drop, so a finger and a
// mouse behave alike. A drag starts after the pointer has moved SLOP pixels, so a
// tap is still a tap, and the click that follows a drag is swallowed.

const SLOP = 6;
const BAND = 56;
const SCROLL_STEP = 14;

/** The ghost that follows the pointer: a copy of the item, lifted and tilted. */
const GHOST =
  "pointer-events-none fixed top-0 left-0 z-50 m-0 rounded-xl border border-cyan bg-surface-2 text-text shadow-2xl will-change-transform";

export type Over = { id: string; side: Side };

type Options = {
  /** Called when something is released over a drop target. */
  onDrop: (source: string, target: string, side: Side) => void;
};

/** Drag and drop for the tap primitives.
 *
 *  Mark what can be dragged with `drag(id)` and where it can land with `data-drop="id"`
 *  (add `data-axis="x"` for a row of chips, where before/after is left/right). `dragging`
 *  is the id in flight and `over` the target under the pointer, for the caller to paint. */
export function useDrag({ onDrop }: Options) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<Over | null>(null);
  const swallow = useRef(false);
  const drop = useRef(onDrop);
  useEffect(() => {
    drop.current = onDrop;
  });
  const cleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanup.current?.(), []);

  const begin = useCallback((event: ReactPointerEvent<HTMLElement>, id: string, gripOnly: boolean) => {
    if (event.button !== 0 || !event.isPrimary) return;
    // A fresh press starts clean: the swallow belongs only to the click right after a drag.
    swallow.current = false;
    // A long row drags from its grip on a touch screen, so the rest of it still scrolls the page.
    const onGrip = event.target instanceof Element && event.target.closest("[data-grip]") !== null;
    if (gripOnly && event.pointerType === "touch" && !onGrip) return;

    const el = event.currentTarget;
    const startX = event.clientX;
    const startY = event.clientY;
    const box = el.getBoundingClientRect();
    const offX = startX - box.left;
    const offY = startY - box.top;
    let active = false;
    let ghost: HTMLElement | null = null;
    let current: Over | null = null;
    let x = startX;
    let y = startY;
    let frame = 0;

    const locate = () => {
      const hit = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-drop]") ?? null;
      let next: Over | null = null;
      if (hit?.dataset.drop) {
        const rect = hit.getBoundingClientRect();
        const horizontal = hit.dataset.axis === "x";
        next = { id: hit.dataset.drop, side: horizontal ? sideOf(x, rect.left, rect.width) : sideOf(y, rect.top, rect.height) };
      }
      if (next?.id !== current?.id || next?.side !== current?.side) {
        current = next;
        setOver(next);
      }
    };

    const place = () => {
      if (ghost) ghost.style.transform = `translate(${x - offX}px, ${y - offY}px) rotate(-1.5deg) scale(1.03)`;
    };

    // While the pointer is near the top or bottom edge the page keeps scrolling.
    const tick = () => {
      const direction = scrollDirection(y, window.innerHeight, BAND);
      if (direction !== 0) {
        window.scrollBy(0, direction * SCROLL_STEP);
        locate();
      }
      frame = requestAnimationFrame(tick);
    };

    const move = (e: PointerEvent) => {
      if (e.pointerId !== event.pointerId) return;
      x = e.clientX;
      y = e.clientY;
      if (!active) {
        if (Math.hypot(x - startX, y - startY) < SLOP) return;
        active = true;
        ghost = el.cloneNode(true) as HTMLElement;
        ghost.removeAttribute("id");
        ghost.setAttribute("aria-hidden", "true");
        ghost.className = `${GHOST} flex items-center`;
        ghost.style.width = `${box.width}px`;
        document.body.appendChild(ghost);
        setDragging(id);
        frame = requestAnimationFrame(tick);
      }
      place();
      locate();
    };

    const end = (e: PointerEvent) => {
      if (e.pointerId !== event.pointerId) return;
      const landed = e.type === "pointerup" ? current : null;
      stop();
      if (active) {
        // The click that follows a drag belongs to the drag, not to a tap.
        swallow.current = true;
        setTimeout(() => {
          swallow.current = false;
        }, 80);
        if (landed) drop.current(id, landed.id, landed.side);
      }
    };

    const stop = () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      ghost?.remove();
      ghost = null;
      setDragging(null);
      setOver(null);
      cleanup.current = null;
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    cleanup.current = stop;
  }, []);

  /** Props that make an element draggable as `id`. `gripOnly` is for long rows. */
  const drag = useCallback(
    (id: string, gripOnly = false) => ({
      onPointerDown: (event: ReactPointerEvent<HTMLElement>) => begin(event, id, gripOnly),
      onClickCapture: (event: { stopPropagation: () => void; preventDefault: () => void }) => {
        if (!swallow.current) return;
        swallow.current = false;
        event.stopPropagation();
        event.preventDefault();
      },
    }),
    [begin],
  );

  return { dragging, over, drag };
}
