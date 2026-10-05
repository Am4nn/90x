"use client";

import { useNavPending } from "./nav-state";

/** Thin bar at the very top while any in-app navigation is in flight.
 *  The CSS (.nav-progress) delays it, so a fast navigation never flashes it. */
export function NavProgress() {
  const pending = useNavPending();
  if (!pending) return null;
  // Keyed so tapping another tab mid-flight restarts the creep.
  return <div key={pending} aria-hidden className="nav-progress pointer-events-none fixed inset-x-0 z-50 h-0.5 bg-cyan" />;
}
