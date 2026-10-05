"use client";

import { useOptimistic } from "react";
import { decideWeeklyAction } from "@/app/actions/weekly";
import { button } from "@/components/button-styles";
import { Busy, useServerAction } from "@/components/form";

/** Accept applies the suggested template changes; Decline keeps the plan. */
export function WeeklyDecision({ reviewId }: { reviewId: string }) {
  const { run, pending, isBusy, error } = useServerAction();
  // The answer reads as decided on the tap; a failure puts the buttons back.
  const [decided, decide] = useOptimistic<boolean | null, boolean>(null, (_, accepted) => accepted);
  const choose = (accepted: boolean) =>
    run(() => decideWeeklyAction(reviewId, accepted), { id: accepted ? "accept" : "decline", optimistic: () => decide(accepted) });
  return (
    <div className="flex flex-col gap-2">
      {decided === null ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            aria-busy={isBusy("accept") || undefined}
            onClick={() => choose(true)}
            className={button({ variant: "primary", size: "lg" })}
          >
            <Busy busy={isBusy("accept")}>Accept</Busy>
          </button>
          <button
            type="button"
            disabled={pending}
            aria-busy={isBusy("decline") || undefined}
            onClick={() => choose(false)}
            className={button({ size: "lg" })}
          >
            <Busy busy={isBusy("decline")}>Decline</Busy>
          </button>
        </div>
      ) : (
        <p className="text-small text-mute">{decided ? "You accepted these changes." : "You kept your plan as it was."}</p>
      )}
      {error && (
        <p role="alert" className="text-small text-bad">
          {error}
        </p>
      )}
    </div>
  );
}
