"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { useMotionPhase } from "./use-motion";

/**
 * A block that rises 32px into place, once, the first time 15% of it is on screen. It is
 * hidden in the HTML (and appears by itself after two seconds if the script never runs),
 * and a visitor who asked for less motion gets it where it belongs from the start.
 */
export function Reveal({ children, late = false, className = "" }: { children: ReactNode; late?: boolean; className?: string }) {
  const phase = useMotionPhase();
  const box = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const element = box.current;
    if (phase !== "live" || !element) return;
    const watch = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setSeen(true);
        watch.disconnect();
      },
      { threshold: 0.15 },
    );
    watch.observe(element);
    return () => watch.disconnect();
  }, [phase]);
  const hidden = phase === "pending" || (phase === "live" && !seen);
  return (
    <div
      ref={box}
      data-pending={phase === "pending" ? "" : undefined}
      data-hidden={hidden ? "" : undefined}
      data-late={late ? "" : undefined}
      className={`landing-reveal ${className}`}
    >
      {children}
    </div>
  );
}
