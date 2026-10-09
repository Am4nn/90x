"use client";

import { useOptimistic, useState } from "react";
import { decideProposal } from "@/app/actions/coach";
import { addWithCoachAction } from "@/app/actions/coach-add";
import { button, chip } from "@/components/button-styles";
import { Ren } from "@/components/coach/ren";
import { Busy, useServerAction } from "@/components/form";
import { useOnline } from "@/components/offline/use-online";
import type { AddMessage } from "@/lib/coach/add";

// "Add with Coach" on Today: a small box under Extras where you say what you want, Coach
// proposes up to three, and only the ones you leave ticked are added. Nothing is added before the tap.

export type AddCoachProps = { threadId: string | null; messages: AddMessage[]; earlier: number; chips: string[] };

const FIRST_PLACEHOLDER = "e.g. a medium graph problem Google asks";
const REFINE_PLACEHOLDER = "Not quite? Tell Coach what to change";
const REFINE_CHIPS = ["Easier", "Harder", "Different pattern"];
const SHOWN = 6;

const AREA_TAG: Record<string, { label: string; tag: string }> = {
  dsa: { label: "DSA", tag: "text-topic-dsa" },
  system_design: { label: "Design", tag: "text-topic-sd" },
  cs: { label: "CS", tag: "text-topic-cs" },
  java: { label: "Java", tag: "text-topic-java" },
  sql: { label: "SQL", tag: "text-topic-sql" },
};

type Proposal = NonNullable<AddMessage["proposal"]>;

/** The checklist for the newest open proposal. Keyed by the proposal, so a new one starts with everything ticked. */
function Picks({
  proposal,
  busy,
  disabled,
  onConfirm,
}: {
  proposal: Proposal;
  busy: boolean;
  disabled: boolean;
  onConfirm: (refs: string[]) => void;
}) {
  const [off, setOff] = useState<ReadonlySet<string>>(new Set());
  const refs = proposal.items.map((i) => i.ref).filter((r) => !off.has(r));
  const toggle = (ref: string) =>
    setOff((set) => {
      const next = new Set(set);
      if (!next.delete(ref)) next.add(ref);
      return next;
    });
  return (
    <>
      <div className="overflow-hidden rounded-xl border border-line">
        {proposal.items.map((item) => {
          const tag = AREA_TAG[item.area];
          return (
            <label key={item.ref} className="flex min-h-11 cursor-pointer items-start gap-3 border-t border-line p-3 first:border-0">
              <span className="relative mt-0.5 size-5 shrink-0">
                {/* The real checkbox sits invisibly over the drawn box, so a tap, a click and the keyboard all reach it. */}
                <input
                  type="checkbox"
                  checked={!off.has(item.ref)}
                  onChange={() => toggle(item.ref)}
                  className="peer absolute inset-0 m-0 size-5 cursor-pointer opacity-0"
                />
                <span
                  aria-hidden="true"
                  className="pointer-events-none grid size-5 place-items-center rounded-sm border-[1.5px] border-line-2 text-cyan peer-checked:border-cyan peer-checked:bg-cyan-bg peer-focus-visible:ring-2 peer-focus-visible:ring-cyan [&>svg]:opacity-0 peer-checked:[&>svg]:opacity-100"
                >
                  <svg viewBox="0 0 12 12" className="size-3" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M2.5 6.5 5 9l4.5-6" />
                  </svg>
                </span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-text">{item.title}</span>
                <span className="block text-small text-mute">{item.meta}</span>
              </span>
              <span className={`tag shrink-0 ${tag?.tag ?? ""}`}>{tag?.label ?? item.area}</span>
            </label>
          );
        })}
      </div>
      <div>
        <button
          type="button"
          disabled={!refs.length || disabled}
          aria-busy={busy || undefined}
          onClick={() => onConfirm(refs)}
          className={button({ variant: "primary", size: "sm" })}
        >
          <Busy busy={busy}>{refs.length ? `Add ${refs.length} to Extras` : "Pick at least one"}</Busy>
        </button>
      </div>
    </>
  );
}

function Typing() {
  return (
    <div className="flex items-start gap-2.5" aria-hidden="true">
      <Ren size={24} />
      <span className="flex gap-1 pt-2.5">
        {[0, 150, 300].map((delay) => (
          <i
            key={delay}
            style={{ animationDelay: `${delay}ms` }}
            className="size-1.5 animate-pulse rounded-full bg-mute motion-reduce:animate-none"
          />
        ))}
      </span>
    </div>
  );
}

/** The open panel. `onClose` folds it (the thread is kept); `onAdded` folds it and says what landed. */
export function AddCoachPanel({ coach, onClose, onAdded }: { coach: AddCoachProps; onClose: () => void; onAdded: (note: string) => void }) {
  const { run, isBusy, error } = useServerAction();
  const online = useOnline();
  const [text, setText] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [messages, addPending] = useOptimistic(coach.messages, (list, sent: string) => [
    ...list,
    { id: "pending", role: "user" as const, text: sent, proposal: null },
  ]);
  const sending = isBusy("send");
  const confirming = isBusy("confirm");
  const talked = messages.some((m) => m.role === "assistant");
  const visible = showAll ? messages : messages.slice(-SHOWN);
  const folded = Math.max(0, messages.length - SHOWN);
  const open = messages.findLast((m) => m.proposal && !m.proposal.status && m.role === "assistant");
  const off = !online || sending || confirming;

  const send = (value: string) => {
    const sent = value.trim();
    if (!sent || off) return;
    setText("");
    run(() => addWithCoachAction(sent), { id: "send", optimistic: () => addPending(sent), rollback: () => setText(sent) });
  };
  const confirm = (proposal: Proposal, refs: string[]) => {
    if (!coach.threadId) return;
    const threadId = coach.threadId;
    run(
      async () => {
        const result = await decideProposal({ threadId, toolCallId: proposal.toolCallId, decision: "confirm", refs });
        if (result.ok) onAdded(result.note ?? `Added ${refs.length} to Extras.`);
        return result;
      },
      { id: "confirm" },
    );
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line-2 bg-surface p-3">
      <div className="flex items-center gap-2.5 text-small text-text-2">
        <Ren size={24} />
        <span>Tell Coach what to add</span>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="group -my-2 -mr-2 ml-auto grid size-11 place-items-center text-mute"
        >
          <span
            aria-hidden="true"
            className="grid size-7 place-items-center rounded-lg text-heading leading-none transition-colors group-hover:bg-surface-2 group-hover:text-text group-focus-visible:bg-surface-2 group-focus-visible:text-text"
          >
            ×
          </span>
        </button>
      </div>

      {folded > 0 && !showAll && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="min-h-11 self-center px-2 text-small font-semibold text-mute transition-colors hover:text-text"
        >
          Earlier · {folded} message{folded === 1 ? "" : "s"}
        </button>
      )}

      {visible.map((m) =>
        m.role === "user" ? (
          <div
            key={m.id}
            className="max-w-xs self-end rounded-xl rounded-br-sm border border-line-2 bg-surface-2 px-3 py-2 text-small text-text"
          >
            {m.text}
          </div>
        ) : (
          <div key={m.id} className="flex items-start gap-2.5">
            <Ren size={24} />
            <div className="flex min-w-0 flex-1 flex-col gap-1 text-small text-text-2">
              <span>{m.text}</span>
              {m.proposal?.status === "confirmed" && (
                <span className="text-mute">Added: {m.proposal.items.map((i) => i.title).join(", ")}</span>
              )}
            </div>
          </div>
        ),
      )}

      {sending && <Typing />}

      {open?.proposal && !sending && (
        <Picks
          key={open.proposal.toolCallId}
          proposal={open.proposal}
          busy={confirming}
          disabled={off}
          onConfirm={(refs) => open.proposal && confirm(open.proposal, refs)}
        />
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
        className="flex items-center gap-1.5"
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={500}
          disabled={sending}
          placeholder={talked ? REFINE_PLACEHOLDER : FIRST_PLACEHOLDER}
          aria-label={talked ? "Refine" : "What Coach should add"}
          className="h-10 min-w-0 flex-1 rounded-xl border border-line-2 bg-background px-2 text-small text-ellipsis text-text outline-none placeholder:text-tag placeholder:text-mute focus:border-cyan disabled:opacity-60"
        />
        <button
          type="submit"
          aria-label="Send"
          aria-busy={sending || undefined}
          disabled={off || !text.trim()}
          className={button({ variant: "primary", size: "icon-sm" })}
        >
          <Busy busy={sending} swap>
            <span aria-hidden="true">↑</span>
          </Busy>
        </button>
      </form>

      {(talked ? REFINE_CHIPS : coach.chips).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {(talked ? REFINE_CHIPS : coach.chips).map((label) => (
            <button key={label} type="button" disabled={off} onClick={() => send(label)} className={chip(false)}>
              {label}
            </button>
          ))}
        </div>
      )}

      {error && (
        <p role="alert" className="text-small text-bad">
          {error}
        </p>
      )}
      {!online && <p className="text-small text-mute">Coach needs a connection.</p>}
    </div>
  );
}

/** The closed link, next to "+ Add a problem". */
export function AddCoachLink({ onOpen }: { onOpen: () => void }) {
  const online = useOnline();
  return (
    <button
      type="button"
      disabled={!online}
      onClick={onOpen}
      className="inline-flex min-h-11 items-center gap-2 text-small font-semibold text-mute transition-colors hover:text-ren focus-visible:text-ren disabled:opacity-50"
    >
      <Ren size={16} />
      Add with Coach
    </button>
  );
}
