"use client";

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
          className="h-9 rounded-lg bg-cyan px-4 text-small font-bold text-on-cyan disabled:opacity-60"
        >
          Keep
        </button>
        <button
          type="button"
          disabled={pending}
          aria-busy={pending || undefined}
          onClick={() => run(() => resolveFlag(cardId, "retire"))}
          className="h-9 rounded-lg border border-line-2 px-4 text-small font-semibold text-text-2 hover:text-text disabled:opacity-60"
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
