"use client";

import { useOptimistic } from "react";
import { button } from "@/components/button-styles";
import { Busy, useServerAction } from "@/components/form";
import { setResolved } from "./actions";

/** Resolved / Reopen. The new state shows on the tap; a failure puts it back. */
export function ResolveToggle({ id, resolved }: { id: string; resolved: boolean }) {
  const { run, pending, isBusy, error } = useServerAction();
  const [shown, show] = useOptimistic(resolved, (_, next: boolean) => next);
  return (
    <div className="flex flex-col items-start gap-1.5">
      <button
        type="button"
        disabled={pending}
        aria-pressed={shown}
        aria-busy={isBusy() || undefined}
        onClick={() => run(() => setResolved(id, !shown), { optimistic: () => show(!shown) })}
        className={button({ variant: shown ? "secondary" : "primary", size: "sm" })}
      >
        <Busy busy={isBusy()}>{shown ? "Reopen" : "Mark resolved"}</Busy>
      </button>
      {error && (
        <p role="alert" className="text-small text-bad">
          {error}
        </p>
      )}
    </div>
  );
}
