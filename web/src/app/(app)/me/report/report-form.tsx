"use client";

import Link from "next/link";
import { useActionState } from "react";
import { sendReport } from "@/app/actions/report";
import { button } from "@/components/button-styles";
import { FormMessage, SubmitButton } from "@/components/form";
import { DOING_MAX, MESSAGE_MAX } from "@/lib/trust/report-rules";

const FIELD = "w-full rounded-xl border border-line-2 bg-surface px-4 py-3 text-body text-text placeholder:text-mute focus:border-cyan";

/** The report form. The button spins on the tap; on success the form is replaced by a thank-you. */
export function ReportForm({ from }: { from: string }) {
  const [state, action] = useActionState(sendReport, {});
  if (state.ok) {
    return (
      <div role="status" className="flex flex-col items-start gap-3 rounded-xl border border-line bg-surface p-5">
        <p className="font-display text-heading font-semibold">Thank you.</p>
        <p className="text-small text-text-2">Your report reached us. If we need more, we will write to the email on your account.</p>
        <Link href={from === "/me/report" ? "/me" : from} className={button({ size: "sm" })}>
          Back
        </Link>
      </div>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="from" value={from} />
      <label className="flex flex-col gap-1.5">
        <span className="text-small font-semibold text-text">What happened?</span>
        <textarea
          name="message"
          required
          maxLength={MESSAGE_MAX}
          rows={6}
          className={FIELD}
          placeholder="What went wrong, and what you expected."
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-small font-semibold text-text">What were you doing? (optional)</span>
        <textarea name="doing" maxLength={DOING_MAX} rows={3} className={FIELD} />
      </label>
      <p className="text-small text-mute">We attach the page you came from, your browser and the app version. Nothing else.</p>
      <SubmitButton pendingLabel="Sending…" className={`${button({ variant: "primary", size: "lg" })} self-start`}>
        Send report
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
