// The /try event kinds and the two pure folds both sides use: the beacon client buckets time,
// admin Analytics reads how far a visit got. Kept apart from the route so neither drags the other in.

export const TRY_KINDS = ["view", "tab", "answer", "listen_start", "listen_95", "listen_pause", "signin_click", "leave"] as const;
export type TryKind = (typeof TRY_KINDS)[number];

/** Where on the page a sign-in was pressed: the pinned bar, desktop card or lesson nudge ("try"), or the top bar ("top"). */
export const TRY_SPOTS = ["try", "top"] as const;
export type TrySpot = (typeof TRY_SPOTS)[number];

export const SECOND_BUCKETS = ["0-10", "10-30", "30-60", "60-120", "120-300", "300+"] as const;
export type SecondBucket = (typeof SECOND_BUCKETS)[number];

const BUCKET_TOPS = [10, 30, 60, 120, 300];

/** Seconds into a coarse bucket, so no event carries an exact time. */
export function bucketSeconds(s: number): SecondBucket {
  const i = BUCKET_TOPS.findIndex((top) => s < top);
  return i === -1 ? "300+" : (SECOND_BUCKETS[i] ?? "300+");
}

export const TRY_STEPS = ["viewed", "answered", "listened", "signed_in"] as const;
export type TryStep = (typeof TRY_STEPS)[number];

const STEP_OF: Partial<Record<TryKind, TryStep>> = {
  answer: "answered",
  listen_start: "listened",
  listen_95: "listened",
  listen_pause: "listened",
  signin_click: "signed_in",
};

/** The furthest step a visit reached, from the kinds it sent (in any order). */
export function furthestStep(kinds: readonly string[]): TryStep {
  let best = 0;
  for (const k of kinds) {
    const step = STEP_OF[k as TryKind];
    if (step) best = Math.max(best, TRY_STEPS.indexOf(step));
  }
  return TRY_STEPS[best] ?? "viewed";
}
