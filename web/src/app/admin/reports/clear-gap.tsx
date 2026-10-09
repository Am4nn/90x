"use client";

import { button } from "@/components/button-styles";
import { Busy, useServerAction } from "@/components/form";
import { clearGap } from "./actions";

/** Drops a topic the admin has dealt with. The row leaves with the refresh after the action. */
export function ClearGap({ topic }: { topic: string }) {
  const { run, pending, isBusy, error } = useServerAction();
  return (
    <div className="flex shrink-0 flex-col items-end gap-1.5">
      <button
        type="button"
        disabled={pending}
        aria-busy={isBusy() || undefined}
        aria-label={`Clear ${topic}`}
        onClick={() => run(() => clearGap(topic))}
        className={button({ variant: "secondary", size: "sm" })}
      >
        <Busy busy={isBusy()}>Clear</Busy>
      </button>
      {error && (
        <p role="alert" className="text-small text-bad">
          {error}
        </p>
      )}
    </div>
  );
}
