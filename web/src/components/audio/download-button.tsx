"use client";

import type { Track } from "./player-provider";

/** The sheet's top-bar download icon. the offline work implements it; until then it keeps the
 *  header balanced with an empty 44 px slot. */
export function DownloadButton({ track }: { track: Track }) {
  return <span aria-hidden data-lesson={track.topicSlug} className="size-11" />;
}
