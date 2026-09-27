"use client";

import { useEffect, useRef, useState } from "react";
import { reportCardAction } from "@/app/actions/feed";
import { button } from "@/components/button-styles";
import { useServerAction } from "@/components/form";

/** Small "Report" link that opens a reason field; two reports hide a card. */
export function ReportCard({ cardId }: { cardId: string }) {
  const { run, pending, error } = useServerAction({ refresh: false });
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  if (sent) return <span className="text-small text-ok">{sent}</span>;
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-small font-semibold text-mute hover:text-text-2">
        Report
      </button>
    );
  }
  return (
    <form
      className="flex w-full flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(async () => {
          const result = await reportCardAction(cardId, reason);
          if (result.ok) setSent(result.note ?? "Reported.");
          return result;
        });
      }}
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-small text-mute">What&apos;s wrong with this card?</span>
        <input
          ref={input}
          value={reason}
          maxLength={500}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Wrong answer, unclear question…"
          className="h-10 rounded-lg border border-line-2 bg-surface-2 px-3 text-text placeholder:text-mute focus:border-cyan focus:outline-none"
        />
      </label>
      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending || !reason.trim()} aria-busy={pending || undefined} className={button({ size: "sm" })}>
          {pending ? "Sending…" : "Send report"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="h-9 px-2 text-small font-semibold text-mute hover:text-text-2">
          Cancel
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
