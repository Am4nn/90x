"use client";

import { useActionState, useOptimistic, useState } from "react";
import { acceptAction, dismissAction, refuseAction, revokeAction, sendInviteAction, unfriendAction } from "@/app/(app)/me/friends-actions";
import { button } from "@/components/button-styles";
import { ActionForm, type FormAction, SubmitButton } from "@/components/form";
import type { SentInvite } from "@/lib/friends/service";

export function InviteForm({ sent, yourName }: { sent: SentInvite[]; yourName: string }) {
  const [state, action] = useActionState(sendInviteAction, {});
  const [email, setEmail] = useState("");
  const [confirming, setConfirming] = useState(false);

  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  if (confirming) {
    return (
      <div className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5">
        <h3 className="font-display text-heading font-semibold text-text">Confirm invite</h3>
        <p className="text-small text-mute">
          An email invite will be sent to <strong className="text-text">{email}</strong>. It names you ({yourName}) as the inviter.
        </p>
        <form
          action={action}
          className="flex items-center gap-3"
          onSubmit={() => {
            setConfirming(false);
            setEmail("");
          }}
        >
          <input type="hidden" name="email" value={email} />
          <button type="button" onClick={() => setConfirming(false)} className={button({ variant: "ghost" })}>
            Cancel
          </button>
          <SubmitButton className={button({ variant: "primary" })}>Send invite</SubmitButton>
        </form>
        {state.error && <p className="text-small text-bad">{state.error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5">
        <h3 className="font-display text-heading font-semibold text-text">Invite a friend</h3>
        <p className="text-small text-mute">Send an invite by email. You can have up to 20 pending invites.</p>
        <div className="flex items-center gap-3">
          <input
            type="email"
            // Placeholder is not an accessible name. /me is not in the axe scan,
            // so nothing in CI would have said so.
            aria-label="Friend's email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="friend@example.com"
            className="flex-1 rounded-lg border border-line bg-surface-2 px-3 py-2 text-small text-text outline-none placeholder:text-mute focus:border-cyan"
            onKeyDown={(e) => {
              if (e.key === "Enter" && valid) setConfirming(true);
            }}
          />
          <button type="button" disabled={!valid} onClick={() => setConfirming(true)} className={button({ variant: "primary" })}>
            Next
          </button>
        </div>
        {state.error && <p className="text-small text-bad">{state.error}</p>}
        {state.ok && state.note && <p className="text-small text-ok">{state.note}</p>}
      </div>

      {sent.length > 0 && (
        <div className="flex flex-col gap-2">
          <h4 className="px-1 text-tag font-semibold text-text-2">Sent invites</h4>
          <ul className="flex flex-col rounded-xl border border-line bg-surface">
            {sent.map((inv) => (
              <SentRow key={inv.id} inv={inv} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** A row that leaves the list on the tap and comes back if the action fails. It stays mounted, hidden, so the error can still show. */
function useLeaving() {
  const [gone, setGone] = useOptimistic(false, (_: boolean, next: boolean) => next);
  const leave = (action: FormAction): FormAction => {
    return (state, form) => {
      setGone(true);
      return action(state, form);
    };
  };
  return { gone, leave };
}

function SentRow({ inv }: { inv: SentInvite }) {
  const { gone, leave } = useLeaving();
  return (
    <li
      className={`flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-small first:border-0 ${gone ? "hidden" : ""}`}
    >
      <div className="flex flex-col">
        <span className="text-text">{inv.email}</span>
        <span className="text-mute capitalize">{inv.status}</span>
      </div>
      {inv.status === "pending" && (
        <ActionForm action={leave(revokeAction)} className="contents">
          <input type="hidden" name="inviteId" value={inv.id} />
          <SubmitButton className={button({ size: "sm", variant: "ghost" })}>Revoke</SubmitButton>
        </ActionForm>
      )}
    </li>
  );
}

function RequestRow({ req }: { req: { id: string; name: string } }) {
  const { gone, leave } = useLeaving();
  return (
    <div
      className={`flex flex-col gap-4 rounded-xl border border-line bg-surface p-5 md:flex-row md:items-center md:justify-between ${gone ? "hidden" : ""}`}
    >
      <p className="text-text">
        <strong>{req.name}</strong> wants to compare progress.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <ActionForm action={leave(acceptAction)} className="contents">
          <input type="hidden" name="inviteId" value={req.id} />
          <SubmitButton className={button({ variant: "primary" })}>Accept</SubmitButton>
        </ActionForm>
        <ActionForm action={leave(refuseAction)} className="contents">
          <input type="hidden" name="inviteId" value={req.id} />
          <SubmitButton title="They'll see that you refused." className={button({ variant: "secondary" })}>
            Refuse
          </SubmitButton>
        </ActionForm>
        <ActionForm action={leave(dismissAction)} className="contents">
          <input type="hidden" name="inviteId" value={req.id} />
          <SubmitButton title="Only you hide it; they still see it as pending." className={button({ variant: "ghost" })}>
            Dismiss
          </SubmitButton>
        </ActionForm>
      </div>
    </div>
  );
}

export function PendingRequests({ requests }: { requests: { id: string; name: string }[] }) {
  if (requests.length === 0) return null;
  return (
    <div className="mb-6 flex flex-col gap-3">
      {requests.map((req) => (
        <RequestRow key={req.id} req={req} />
      ))}
    </div>
  );
}

export function UnfriendButton({ otherId, otherName }: { otherId: string; otherName: string }) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <ActionForm action={unfriendAction} className="mt-2 flex flex-col items-end gap-2">
        <span className="text-tag text-mute">Unfriend {otherName}?</span>
        <div className="flex gap-2">
          <button type="button" onClick={() => setConfirming(false)} className={button({ size: "sm", variant: "ghost" })}>
            Cancel
          </button>
          <input type="hidden" name="otherId" value={otherId} />
          <SubmitButton className={button({ size: "sm" })}>Confirm</SubmitButton>
        </div>
      </ActionForm>
    );
  }

  return (
    <button type="button" onClick={() => setConfirming(true)} className="mt-2 text-tag text-mute underline hover:text-bad">
      Unfriend
    </button>
  );
}
