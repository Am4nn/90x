"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { TAB_SKELETONS } from "./tab-skeletons";

// A tap must be felt on the same frame, so the shell tracks where the user is
// heading itself instead of waiting for the server to commit the route. `from` is
// the pathname at tap time: once the router commits anything else (the target,
// a redirect, Back) the tap is stale and `pending` drops to null without an effect.
type Tap = { to: string; from: string };

const Pending = createContext<string | null>(null);

/** The path a tap is heading to, or null when nothing is in flight. */
export function useNavPending() {
  return useContext(Pending);
}

// Phones show these on the tab bar, desktops add Friends. Not /feed: a prefetch
// re-renders the Feed page and can reshuffle its card queue (lib/feed/service.ts),
// so Feed keeps Link's default prefetch only, which stops at its loading boundary.
const PREFETCH = ["/today", "/library", "/coach", "/me"];

// If a navigation never commits (offline, a cancelled request) the skeleton must not stay.
const GIVE_UP_MS = 10_000;

export function NavProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [tap, setTap] = useState<Tap | null>(null);

  // Internal Link clicks. Link calls preventDefault when it takes over a click,
  // and its handler runs before this one on document, so that is the signal.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target instanceof Element ? e.target.closest("a") : null;
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname === pathname) return;
      // Synchronous, so the new tab and its skeleton paint before the next frame.
      flushSync(() => setTap({ to: url.pathname, from: pathname }));
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [pathname]);

  // Once any navigation lands the tap is over. Keeping it would bring it back on Back,
  // when the path matches its `from` again: the wrong tab lit, its skeleton over the page.
  // Cleared while rendering the new path, React's pattern for state that follows a prop.
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    setTap(null);
  }

  useEffect(() => {
    if (!tap) return;
    const t = setTimeout(() => setTap(null), GIVE_UP_MS);
    return () => clearTimeout(t);
  }, [tap]);

  // After first paint, when the browser is idle, warm the other tabs.
  useEffect(() => {
    const hrefs = matchMedia("(min-width: 768px)").matches ? [...PREFETCH, "/friends"] : PREFETCH;
    const run = () => hrefs.forEach((h) => router.prefetch(h));
    if ("requestIdleCallback" in window) {
      const id = requestIdleCallback(run);
      return () => cancelIdleCallback(id);
    }
    // Safari has no requestIdleCallback.
    const id = setTimeout(run, 300);
    return () => clearTimeout(id);
  }, [router]);

  return <Pending value={tap && tap.from === pathname ? tap.to : null}>{children}</Pending>;
}

/** The page area. While a tab is pending it shows that tab's skeleton at once and
 *  keeps the stale page mounted but hidden, so a cancelled navigation loses nothing. */
export function NavContent({ children }: { children: React.ReactNode }) {
  const pending = useNavPending();
  const Skeleton = pending ? TAB_SKELETONS[pending] : undefined;
  return (
    <>
      {Skeleton && <Skeleton />}
      <div className={Skeleton ? "hidden" : "contents"}>{children}</div>
    </>
  );
}
