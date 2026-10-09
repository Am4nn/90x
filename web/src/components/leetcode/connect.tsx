"use client";

import { useId, useState, useTransition } from "react";
import { type ConnectResult, connectLeetCode } from "@/app/actions/sync";
import { button } from "@/components/button-styles";
import { Busy } from "@/components/form";

// Stands in for a Sync button while the reader has no LeetCode username (Set up
// lets them skip it, and nothing else asks). A div, not a form: the check-in
// panel it sits in is already one, so Enter is caught here instead.

type Connected = Extract<ConnectResult, { ok: true }>;

export function LeetCodeConnect({
  onConnected,
  slug,
  size = "md",
}: {
  onConnected: (connected: Connected) => void;
  /** On a problem page: the connect sync also reports this problem. */
  slug?: string;
  size?: "md" | "lg";
}) {
  const id = useId();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function connect() {
    if (pending) return;
    setError(null);
    start(async () => {
      const r = await connectLeetCode(value, slug).catch(() => null);
      if (!r) return setError("Couldn't reach 90x. Check your connection and try again.");
      if ("error" in r) return setError(r.error);
      onConnected(r);
    });
  }

  return (
    <div className="flex flex-col gap-2" data-testid="leetcode-connect">
      <label htmlFor={id} className="text-small font-semibold text-text-2">
        LeetCode username
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            connect();
          }}
          placeholder="e.g. am4nn"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : `${id}-hint`}
          className={`min-w-0 flex-1 rounded-xl border border-line-2 bg-transparent px-3.5 text-text outline-none placeholder:text-mute focus:border-cyan ${size === "lg" ? "h-11" : "h-10"}`}
        />
        <button
          type="button"
          onClick={connect}
          disabled={pending || !value.trim()}
          aria-busy={pending || undefined}
          className={button({ variant: "primary", size })}
        >
          <Busy busy={pending}>{pending ? "Connecting…" : "Connect"}</Busy>
        </button>
      </div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-small text-bad">
          {error}
        </p>
      ) : (
        <p id={`${id}-hint`} className="text-small text-mute">
          Syncs your solves, so check-ins are real. A profile link works too.
        </p>
      )}
    </div>
  );
}
