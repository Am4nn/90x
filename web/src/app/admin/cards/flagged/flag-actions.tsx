"use client";

import { useOptimistic } from "react";
import { button } from "@/components/button-styles";
import { Busy, useServerAction } from "@/components/form";
import { resolveFlag } from "../actions";

export function FlagActions({ cardId }: { cardId: string }) {
  const { run, pending, isBusy, error } = useServerAction();
  // The verdict shows on the tap; a failure puts the buttons back.
  const [verdict, decide] = useOptimistic<"keep" | "retire" | null, "keep" | "retire">(null, (_, next) => next);
  const choose = (choice: "keep" | "retire") => run(() => resolveFlag(cardId, choice), { id: choice, optimistic: () => decide(choice) });
  return (
    <div className="flex flex-col items-end gap-1.5">
      {verdict ? (
        <span className="text-small text-mute">{verdict === "keep" ? "Kept" : "Retired"}</span>
      ) : (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={pending}
            aria-busy={isBusy("keep") || undefined}
            onClick={() => choose("keep")}
            className={button({ variant: "primary", size: "sm" })}
          >
            <Busy busy={isBusy("keep")}>Keep</Busy>
          </button>
          <button
            type="button"
            disabled={pending}
            aria-busy={isBusy("retire") || undefined}
            onClick={() => choose("retire")}
            className={button({ size: "sm" })}
          >
            <Busy busy={isBusy("retire")}>Retire</Busy>
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-small text-bad">
          {error}
        </p>
      )}
    </div>
  );
}
