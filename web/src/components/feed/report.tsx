"use client";

import { useEffect, useRef, useState } from "react";
import { reportCardAction } from "@/app/actions/feed";
import { useServerAction } from "@/components/form";

const MAX = 300;

function grow(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
}

/** The inline report field under a card's footer: one underlined line that grows, a
 *  Send link, nothing that looks like a dialog. Two reports hide a card. */
export function ReportForm({ cardId, onSent }: { cardId: string; onSent: () => void }) {
  const { run, pending, error } = useServerAction({ refresh: false });
  const [reason, setReason] = useState("");
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    field.current?.focus();
  }, []);

  return (
    <form
      className="flex flex-col gap-2 border-t border-line py-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(async () => {
          const result = await reportCardAction(cardId, reason);
          if (result.ok) onSent();
          return result;
        });
      }}
    >
      <textarea
        ref={field}
        value={reason}
        rows={1}
        maxLength={MAX}
        aria-label="What's wrong with this card?"
        placeholder="What's wrong with this card?"
        onChange={(e) => {
          setReason(e.target.value);
          grow(e.target);
        }}
        className="max-h-30 w-full resize-none border-b border-line-2 bg-transparent py-1.5 text-small text-text placeholder:text-mute focus:border-cyan focus:outline-none"
      />
      <div className="flex items-center justify-between gap-3">
        <span className="tabular text-tag text-mute">
          {reason.length} / {MAX}
        </span>
        <button
          type="submit"
          disabled={pending || !reason.trim()}
          aria-busy={pending || undefined}
          className="text-small font-semibold text-cyan disabled:text-mute"
        >
          {pending ? "Sending…" : "Send"}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-small text-bad">
          {error}
        </p>
      )}
    </form>
  );
}
