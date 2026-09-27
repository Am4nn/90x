"use client";

import { useState } from "react";
import { queueProblemsAction } from "@/app/actions/missions";
import { useServerAction } from "@/components/form";

/** Adds problems to the plan as extra missions; says where they went. */
export function QueueButton({ slugs, from, label }: { slugs: string[]; from: "review" | "lesson"; label: string }) {
  const { run, pending, error } = useServerAction();
  const [note, setNote] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={pending || note !== null}
        aria-busy={pending || undefined}
        onClick={() =>
          run(async () => {
            const result = await queueProblemsAction(slugs, from);
            if (result.note) setNote(result.note);
            return result;
          })
        }
        className="h-11 rounded-xl bg-cyan px-5 font-semibold text-on-cyan disabled:opacity-60"
      >
        {pending ? "Adding…" : note ? "Queued" : label}
      </button>
      {error && (
        <p role="alert" className="text-small text-bad">
          {error}
        </p>
      )}
      {note && <p className="text-small text-ok">{note}</p>}
    </div>
  );
}
