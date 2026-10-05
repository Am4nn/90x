"use client";

import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
import { decideProposal } from "@/app/actions/coach";
import { button } from "@/components/button-styles";
import { Busy } from "@/components/form";
import { changeLine, type Proposal, type ProposalStatus } from "@/lib/coach/proposals";

const CONFIRM_LABEL: Record<Proposal["type"], string> = {
  queue_cards: "Add to feed",
  add_mission: "Add to today",
  suggest_template_change: "Accept",
  save_memory: "Save",
  start_mock: "Start mock",
  queue_ladder: "Add to plan",
  end_mock: "End and score",
};

const DONE_LABEL: Record<Proposal["type"], string> = {
  queue_cards: "Added to your feed",
  add_mission: "Added to today",
  suggest_template_change: "Plan updated",
  save_memory: "Saved to what Coach knows",
  start_mock: "Mock started",
  queue_ladder: "Added to your plan",
  end_mock: "Mock ended",
};

/** An action the coach proposed. Nothing happens until Confirm. */
export function ProposalCard({
  threadId,
  toolCallId,
  proposal,
  status: savedStatus,
}: {
  threadId: string;
  toolCallId: string;
  proposal: Proposal;
  status?: ProposalStatus;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<ProposalStatus | undefined>(savedStatus);
  const [message, setMessage] = useState<{ text: string; bad: boolean } | null>(null);
  // Not now answers on the tap; a failure puts the buttons back.
  const [shownStatus, showStatus] = useOptimistic(status, (_: ProposalStatus | undefined, next: ProposalStatus) => next);
  const [pending, startTransition] = useTransition();
  const [pressed, setPressed] = useState<"confirm" | "dismiss" | null>(null);

  const decide = (decision: "confirm" | "dismiss") => {
    setPressed(decision);
    setMessage(null);
    startTransition(async () => {
      if (decision === "dismiss") showStatus("dismissed");
      try {
        const result = await decideProposal({ threadId, toolCallId, decision });
        if (result.error) {
          setMessage({ text: result.error, bad: true });
          return;
        }
        setStatus(result.status);
        if (result.note) setMessage({ text: result.note, bad: false });
        if (result.href) router.push(result.href);
      } catch {
        setMessage({ text: "That didn't go through. Check your connection and try again.", bad: true });
      }
    });
  };

  const changes = proposal.type === "suggest_template_change" ? proposal.payload.changes : [];
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line-2 bg-background p-4">
      <p className="font-semibold text-text">{proposal.summary}</p>
      {changes.length > 0 && (
        <ul className="flex flex-col gap-1 text-small text-text-2">
          {changes.map((c) => (
            <li key={`${c.weekday}-${c.slot}`} className="tabular">
              {changeLine(c)}
            </li>
          ))}
        </ul>
      )}
      {shownStatus ? (
        <p className="text-small text-mute">{shownStatus === "confirmed" ? DONE_LABEL[proposal.type] : "Dismissed"}</p>
      ) : (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => decide("dismiss")}
            disabled={pending}
            aria-busy={(pending && pressed === "dismiss") || undefined}
            className={button()}
          >
            <Busy busy={pending && pressed === "dismiss"}>Not now</Busy>
          </button>
          <button
            type="button"
            onClick={() => decide("confirm")}
            disabled={pending}
            aria-busy={(pending && pressed === "confirm") || undefined}
            className={button({ variant: "primary" })}
          >
            <Busy busy={pending && pressed === "confirm"}>
              {pending && pressed === "confirm" ? "Working…" : CONFIRM_LABEL[proposal.type]}
            </Busy>
          </button>
        </div>
      )}
      {message && (
        <p role={message.bad ? "alert" : undefined} className={`text-small ${message.bad ? "text-bad" : "text-ok"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
