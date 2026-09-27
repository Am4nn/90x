"use client";

import { button } from "@/components/button-styles";
import { useServerAction } from "@/components/form";
import { resolveFlag } from "../actions";

export function FlagActions({ cardId }: { cardId: string }) {
  const { run, pending, error } = useServerAction();
  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          aria-busy={pending || undefined}
          onClick={() => run(() => resolveFlag(cardId, "keep"))}
          className={button({ variant: "primary", size: "sm" })}
        >
          Keep
        </button>
        <button
          type="button"
          disabled={pending}
          aria-busy={pending || undefined}
          onClick={() => run(() => resolveFlag(cardId, "retire"))}
          className={button({ size: "sm" })}
        >
          Retire
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
