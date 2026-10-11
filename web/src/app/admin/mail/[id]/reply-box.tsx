"use client";

import { useState, useTransition } from "react";
import { button, chip } from "@/components/button-styles";
import { Busy, FormMessage } from "@/components/form";
import { quickReplies, REPLY_BODY_MAX, REPLY_SUBJECT_MAX, replySubject } from "@/lib/admin/reply-rules";
import { replyEmail } from "@/lib/email/templates";
import { sendReply } from "./actions";

const FIELD = "w-full rounded-xl border border-line-2 bg-surface px-4 py-3 text-body text-text placeholder:text-mute focus:border-cyan";

type Tab = "write" | "preview";

/**
 * The reply box under a received message. The server re-reads the recipient from Resend, so `to` here is only
 * what is shown. Preview builds the email with the same function the server sends with.
 */
export function ReplyBox({
  id,
  to,
  from,
  date,
  subject,
  text,
}: {
  id: string;
  to: string;
  from: string;
  date: string;
  subject: string;
  /** Their message's text, or null when it is HTML-only and there is nothing to quote. */
  text: string | null;
}) {
  const [tab, setTab] = useState<Tab>("write");
  const [subj, setSubj] = useState(replySubject(subject));
  const [body, setBody] = useState("");
  const [quote, setQuote] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sentNote, setSentNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (sentNote) {
    return (
      <p role="status" className="rounded-xl border border-line bg-surface px-4 py-3.5 text-small text-ok">
        {sentNote}
      </p>
    );
  }

  const ready = body.trim().length > 0 && subj.trim().length > 0;
  const send = () => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await sendReply({ id, subject: subj, body, quote: quote && text !== null });
        if (result.error) setError(result.error);
        else setSentNote(result.note ?? "Reply sent.");
      } catch {
        setError("That didn't go through. Check your connection and try again.");
      }
    });
  };

  const preview = replyEmail({ to, subject: subj, body, theirFrom: from, theirDate: date, quote: quote ? text : null });

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-4" aria-label="Reply">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display text-heading font-semibold">Reply</h3>
        <div role="tablist" className="flex gap-1 rounded-lg border border-line p-0.5">
          {(["write", "preview"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`h-8 rounded-md px-3 text-small font-semibold capitalize ${tab === t ? "bg-surface-2 text-text" : "text-mute hover:text-text"}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2 text-small">
        <div className="flex gap-3">
          <span className="w-14 shrink-0 text-mute">To</span>
          <span className="min-w-0 break-words text-text-2">{to}</span>
        </div>
        <label className="flex items-center gap-3">
          <span className="w-14 shrink-0 text-mute">Subject</span>
          <input
            value={subj}
            onChange={(e) => setSubj(e.target.value)}
            maxLength={REPLY_SUBJECT_MAX}
            className={`${FIELD} min-w-0 flex-1 py-2`}
          />
        </label>
      </div>

      {tab === "write" ? (
        <>
          <div className="flex flex-wrap gap-2" aria-label="Quick replies">
            {quickReplies().map((q) => (
              <button key={q.label} type="button" className={chip(false)} onClick={() => setBody(q.text)}>
                {q.label}
              </button>
            ))}
          </div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={REPLY_BODY_MAX}
            rows={8}
            aria-label="Your reply"
            placeholder="Write the middle of the reply. The greeting, sign-off and footer are added for you."
            className={FIELD}
          />
        </>
      ) : (
        <iframe
          title="What they receive"
          sandbox=""
          srcDoc={preview.html}
          className="h-[28rem] w-full rounded-xl border border-line bg-white"
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        {text !== null ? (
          <label className="flex items-center gap-2 text-small text-text-2">
            <input type="checkbox" checked={quote} onChange={(e) => setQuote(e.target.checked)} />
            Include their message below
          </label>
        ) : (
          <span className="text-small text-mute">Their message is HTML-only, so it is not quoted.</span>
        )}
        <div className="flex items-center gap-3">
          <span className="text-small text-mute">
            {body.length} / {REPLY_BODY_MAX}
          </span>
          <button
            type="button"
            onClick={send}
            disabled={!ready || pending}
            aria-busy={pending || undefined}
            className={button({ variant: "primary", size: "md" })}
          >
            <Busy busy={pending}>{pending ? "Sending…" : "Send reply"}</Busy>
          </button>
        </div>
      </div>
      <FormMessage state={{ error: error ?? undefined }} />
    </section>
  );
}
