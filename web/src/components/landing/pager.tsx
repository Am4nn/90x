"use client";

import { useSyncExternalStore } from "react";
import { PAGE_IDS, pageIndex } from "@/lib/landing/pages";

function subscribe(onChange: () => void) {
  window.addEventListener("scroll", onChange, { passive: true });
  window.addEventListener("resize", onChange);
  return () => {
    window.removeEventListener("scroll", onChange);
    window.removeEventListener("resize", onChange);
  };
}

/** The phone page the scroll position is on. Pages are as tall as the first one. */
function read(): number {
  const first = document.querySelector<HTMLElement>('[data-page="hero"]');
  return pageIndex(window.scrollY, first?.offsetHeight ?? window.innerHeight);
}

/**
 * Five dots on the right edge, the current one cyan. Phone only. It is a sticky zero-height
 * wrapper with an absolutely placed list, as the particle overlay is: `position: fixed` would
 * be positioned against the landing root (a size container is a containing block for fixed
 * descendants), not against the screen.
 */
export function Pager() {
  const current = useSyncExternalStore(subscribe, read, () => 0);
  return (
    <div className="pointer-events-none sticky top-0 z-6 hidden h-0 @max-wide:block">
      <ol
        aria-hidden="true"
        data-landing="pager"
        className="absolute top-half-svh right-3 m-0 flex -translate-y-1/2 list-none flex-col gap-2.5 p-0"
      >
        {PAGE_IDS.map((id, index) => (
          <li
            key={id}
            data-on={index === current ? "" : undefined}
            className="block size-1.5 rounded-full bg-mute-3 transition-colors duration-250 data-[on]:bg-cyan motion-reduce:transition-none"
          />
        ))}
      </ol>
    </div>
  );
}
