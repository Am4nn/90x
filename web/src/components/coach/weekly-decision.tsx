"use client";

import { decideWeeklyAction } from "@/app/actions/weekly";
import { useServerAction } from "@/components/form";

/** Accept applies the suggested template changes; Decline keeps the plan. */
export function WeeklyDecision({ reviewId }: { reviewId: string }) {
  const { run, pending, error } = useServerAction();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          aria-busy={pending || undefined}
          onClick={() => run(() => decideWeeklyAction(reviewId, true))}
          className="h-11 rounded-xl bg-cyan px-5 font-semibold text-on-cyan disabled:opacity-60"
        >
          Accept
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => decideWeeklyAction(reviewId, false))}
          className="h-11 rounded-xl border border-line-2 px-5 font-semibold text-text disabled:opacity-60"
        >
          Decline
        </button>
      </div>
      {error && (
        <p role="alert" className="text-small text-bad">
          {error}
        </p>
      )}
    </div>
  );
}
