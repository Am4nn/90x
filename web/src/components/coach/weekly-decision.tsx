"use client";

import { decideWeeklyAction } from "@/app/actions/weekly";
import { button } from "@/components/button-styles";
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
          className={button({ variant: "primary", size: "lg" })}
        >
          Accept
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => decideWeeklyAction(reviewId, false))}
          className={button({ size: "lg" })}
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
