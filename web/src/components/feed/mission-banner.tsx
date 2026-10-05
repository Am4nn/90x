"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { button } from "@/components/button-styles";
import { DismissButton, localDay, remember, useRemembered } from "@/components/dismiss";
import { missionBanner, type SessionStats } from "@/lib/feed/view";

const SEEN_KEY = "90x:mission-banner-seen";

/**
 * "Your missions are waiting", once a day per device. It appears on the card
 * where the reader crosses the threshold and leaves with the ×, the next answer,
 * or leaving the Feed; after that it does not come back until tomorrow.
 */
export function MissionBanner({ session }: { session: SessionStats }) {
  const seenToday = useRemembered(SEEN_KEY);
  // The answered count it appeared at, on this visit. Claimed during render (derived
  // state), so it shows on the same frame the count crosses the threshold.
  const [shownAt, setShownAt] = useState<number | null>(null);
  const [closed, setClosed] = useState(false);
  const due = missionBanner(session);
  if (due && shownAt === null && !seenToday) setShownAt(session.answered);

  // Seen as soon as it shows: leaving the Feed and coming back never shows it again today.
  useEffect(() => {
    if (shownAt !== null) remember(SEEN_KEY, localDay());
  }, [shownAt]);

  if (!due || closed || shownAt !== session.answered) return null;
  return (
    <div className="flex items-start gap-2 rounded-2xl border border-cyan/40 bg-cyan-bg p-4">
      <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span className="font-semibold">You&apos;ve done {session.answered} cards. Your missions are waiting.</span>
        <Link href="/today" className={`${button({ variant: "primary" })} shrink-0 self-start sm:self-auto`}>
          Go to Today
        </Link>
      </div>
      <DismissButton label="Hide" onClick={() => setClosed(true)} />
    </div>
  );
}
