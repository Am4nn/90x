"use client";

import { useEffect, useRef } from "react";

/** The Pattern Map is wider than a phone: start it scrolled so the selected pattern is in view. */
export function MapScroller({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = ref.current;
    const node = box?.querySelector<SVGGElement>("[data-selected]");
    if (!box || !node || box.scrollWidth <= box.clientWidth) return;
    const a = box.getBoundingClientRect();
    const b = node.getBoundingClientRect();
    box.scrollLeft += b.left + b.width / 2 - (a.left + a.width / 2);
  }, []);
  return (
    <div ref={ref} className="overflow-x-auto rounded-xl border border-line bg-surface">
      {children}
    </div>
  );
}
