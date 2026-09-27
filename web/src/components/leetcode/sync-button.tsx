"use client";

import { useState, useTransition } from "react";
import { syncNow } from "@/app/actions/sync";

const MESSAGES = {
  disabled: "Add your LeetCode username in setup to sync.",
  skipped: "Sync is paused after repeated failures; it retries once a day.",
  unknown_user: "LeetCode has no user with your username. Check it in setup.",
} as const;

export function SyncButton() {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        type="button"
        disabled={pending}
        aria-busy={pending || undefined}
        onClick={() =>
          start(async () => {
            const r = await syncNow().catch(() => null);
            if (!r) return setMessage("Couldn't reach 90x. Check your connection and try again.");
            if (r.status === "ok") setMessage(r.created.length ? `${r.created.length} new from LeetCode` : "Up to date");
            else if (r.status === "failed") setMessage("LeetCode didn't respond. Your manual check-ins still work.");
            else setMessage(MESSAGES[r.status]);
          })
        }
        className="h-9 rounded-lg border border-line-2 px-4 text-small font-semibold text-text disabled:opacity-60"
      >
        {pending ? "Syncing…" : "Sync"}
      </button>
      {message && (
        <span className="text-small text-mute" role="status">
          {message}
        </span>
      )}
    </div>
  );
}
