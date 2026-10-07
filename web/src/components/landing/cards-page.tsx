"use client";

import type { ReactNode } from "react";
import { CARDS_TITLE } from "@/lib/landing/copy";
import { startWallMotion } from "@/lib/landing/wall-motion";
import { PHONE_PAGE } from "./phone-page";
import { useMotionPhase } from "./use-motion";

// A ref that starts the drifting when the wall is on screen and stops it when it leaves (React calls what it returns).
const drift = (wall: HTMLDivElement) => startWallMotion(wall);

/**
 * Page three on a phone: the title over one slow-scrolling column of the wall's cards, faded
 * at the top and the bottom. The column holds the cards twice so it loops without a seam; the
 * second set is hidden from screen readers. Static under reduced motion. No reveal animation
 * here: a block that starts 32px low would count towards the page's scroll height.
 */
export function CardsPage({ cards }: { cards: ReactNode[] }) {
  const phase = useMotionPhase();
  return (
    <section data-landing="cards" data-page="cards" aria-labelledby="cards-h" className={PHONE_PAGE}>
      <h2 id="cards-h" className="flex-none font-display text-page font-bold tracking-hero">
        {CARDS_TITLE}
      </h2>
      <div
        ref={phase === "live" ? drift : undefined}
        data-landing="cards-wall"
        className="-mx-4 min-h-0 flex-1 overflow-hidden landing-fade-y px-4"
      >
        <div data-wall-column className="flex flex-col gap-3.5 will-change-transform">
          <div className="flex flex-col gap-3.5">{cards}</div>
          <div aria-hidden="true" className="flex flex-col gap-3.5">
            {cards}
          </div>
        </div>
      </div>
    </section>
  );
}
