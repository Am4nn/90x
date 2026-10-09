"use client";

import { useId, useState, useTransition } from "react";
import { type ChangeResult, changeLeetCode, removeLeetCode } from "@/app/actions/sync";
import { button } from "@/components/button-styles";
import { Busy } from "@/components/form";

// Settings → Account → LeetCode: the one place to change the username after Set up
// (or to give one, or to remove it). Saving checks the name with LeetCode first, so a
// typo never replaces a working name.

type Mode = "view" | "edit" | "remove";

// Not built on button({ variant: "ghost" }): its own text colour wins over text-bad.
const DANGER =
  "inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3 text-small font-semibold text-bad transition-colors hover:bg-bad/10 disabled:opacity-50";

export function LeetCodeSetting({ username: initial }: { username: string | null }) {
  const id = useId();
  const [username, setUsername] = useState(initial);
  const [mode, setMode] = useState<Mode>("view");
  const [value, setValue] = useState(initial ?? "");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function run(action: () => Promise<ChangeResult>, done: (r: Extract<ChangeResult, { ok: true }>) => void) {
    if (pending) return;
    setError(null);
    start(async () => {
      const r = await action().catch(() => null);
      if (!r) return setError("Couldn't reach 90x. Check your connection and try again.");
      if ("error" in r) return setError(r.error);
      setUsername(r.username);
      setMode("view");
      done(r);
    });
  }

  const save = () =>
    run(
      () => changeLeetCode(value),
      (r) => {
        if (!r.result) return setNote(null);
        if (r.result.status === "ok") return setNote(r.result.created.length ? `Synced: ${r.result.created.length} new` : "Synced");
        setNote("Saved. It syncs when LeetCode answers.");
      },
    );
  const remove = () => run(removeLeetCode, () => setNote("Removed. Check-ins already synced stay."));
  const open = (next: Mode) => {
    setError(null);
    setNote(null);
    setValue(username ?? "");
    setMode(next);
  };

  return (
    <li className="flex flex-col gap-3 border-t border-line px-4 py-3.5 first:border-0" data-testid="leetcode-setting">
      <div className="flex items-center justify-between gap-4">
        <span className="text-small text-text-2">LeetCode</span>
        {mode === "view" && (
          <span className="flex items-center gap-1">
            <span className={`text-small font-semibold ${username ? "text-text" : "text-mute"}`}>{username ?? "Not connected"}</span>
            <button type="button" onClick={() => open("edit")} className={`${button({ variant: "ghost", size: "sm" })} -mr-2`}>
              {username ? "Edit" : "Add"}
            </button>
          </span>
        )}
      </div>

      {mode === "edit" && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <label htmlFor={id} className="sr-only">
            LeetCode username
          </label>
          <input
            id={id}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="e.g. am4nn"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            className="h-10 min-w-0 rounded-xl border border-line-2 bg-transparent px-3.5 text-text outline-none placeholder:text-mute focus:border-cyan"
          />
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={pending || !value.trim()}
              aria-busy={pending || undefined}
              className={button({ variant: "primary", size: "sm" })}
            >
              <Busy busy={pending}>{pending ? "Checking…" : "Save"}</Busy>
            </button>
            <button type="button" onClick={() => open("view")} disabled={pending} className={button({ variant: "ghost", size: "sm" })}>
              Cancel
            </button>
            {username && (
              <button type="button" onClick={() => open("remove")} disabled={pending} className={`${DANGER} ml-auto`}>
                Remove
              </button>
            )}
          </div>
        </form>
      )}

      {mode === "remove" && (
        <div className="flex flex-col gap-2">
          <p className="text-small text-text-2">Stop syncing {username}? Check-ins already synced stay.</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              aria-busy={pending || undefined}
              className={`${DANGER} border border-bad/40`}
            >
              <Busy busy={pending}>{pending ? "Removing…" : "Remove"}</Busy>
            </button>
            <button type="button" onClick={() => open("edit")} disabled={pending} className={button({ variant: "ghost", size: "sm" })}>
              Keep it
            </button>
          </div>
        </div>
      )}

      {error && (
        <p id={`${id}-error`} role="alert" className="text-small text-bad">
          {error}
        </p>
      )}
      {!error && note && (
        <p role="status" className="text-small text-mute">
          {note}
        </p>
      )}
    </li>
  );
}
