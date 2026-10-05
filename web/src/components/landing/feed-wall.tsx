"use client";

import { type ReactNode, useSyncExternalStore } from "react";
import { deal, wallColumns } from "@/lib/landing/wall";
import { startWallMotion } from "@/lib/landing/wall-motion";
import { useMotionPhase } from "./use-motion";

// The wall's columns follow the landing root's width (three from 980px, two below), the
// same width its @wide: layout answers to, read here through a ResizeObserver on the root.

function rootOf() {
  return document.querySelector('[data-landing="root"]');
}

function subscribe(onChange: () => void) {
  const root = rootOf();
  if (!root) return () => undefined;
  const watch = new ResizeObserver(onChange);
  watch.observe(root);
  return () => watch.disconnect();
}

// A ref that starts the drifting when the wall is on the page and stops it when it leaves (React calls what it returns).
const drift = (wall: HTMLDivElement) => startWallMotion(wall);

/**
 * Cards in drifting columns: three columns on a wide screen, two rows on a phone. Each
 * column holds the cards twice so it can loop; the second set is hidden from screen readers.
 * Under reduced motion the cards simply sit where they start.
 */
export function FeedWall({ cards }: { cards: ReactNode[] }) {
  const phase = useMotionPhase();
  const count = useSyncExternalStore(
    subscribe,
    () => wallColumns(rootOf()?.clientWidth ?? 1280),
    () => 3,
  );
  return (
    // Keyed by the column count: a different count is a different set of columns, and a new wall to move.
    <div
      key={count}
      ref={phase === "live" ? drift : undefined}
      data-landing="feed-wall"
      className="-mx-5 grid grid-cols-1 gap-3.5 overflow-hidden landing-fade-x @wide:mx-0 @wide:h-wall @wide:grid-cols-2 @wide:landing-fade-y @wall:grid-cols-3"
    >
      {deal(cards, count).map((set, column) => (
        <div
          key={column}
          data-wall-column
          className="flex w-max flex-row items-start gap-3.5 will-change-transform @wide:w-auto @wide:flex-col @wide:items-stretch"
        >
          <div className="flex flex-row items-start gap-3.5 @wide:flex-col @wide:items-stretch">{set}</div>
          <div aria-hidden="true" className="flex flex-row items-start gap-3.5 @wide:flex-col @wide:items-stretch">
            {set}
          </div>
        </div>
      ))}
    </div>
  );
}
