"use client";

import { useState } from "react";
import { deleteAccount } from "@/app/actions/account";
import { button } from "@/components/button-styles";
import { ActionForm, SubmitButton } from "@/components/form";
import { CONFIRM_WORD } from "@/lib/trust/account-rules";

/** The danger zone: a button, then an in-page confirmation where the person types the word. */
export function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const ready = typed.trim().toUpperCase() === CONFIRM_WORD;
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-bad/40 p-4">
      <h2 className="font-display text-heading font-semibold text-bad">Delete my account</h2>
      {!open ? (
        <>
          <p className="text-small text-text-2">
            Removes your account and everything stored with it: answers, check-ins, Coach chats and memory. It cannot be undone.
          </p>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className={`${button({ variant: "ghost" })} self-start border border-bad/40 text-bad`}
          >
            Delete my account…
          </button>
        </>
      ) : (
        <ActionForm action={deleteAccount}>
          <p className="text-small text-text-2">
            This deletes your account and all of your data for good. Type <strong className="text-text">{CONFIRM_WORD}</strong> to confirm.
          </p>
          <input
            name="confirm"
            aria-label={`Type ${CONFIRM_WORD} to confirm`}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            className="h-11 w-full rounded-xl border border-line-2 bg-surface px-4 text-body text-text focus:border-bad"
          />
          <div className="flex flex-wrap gap-2">
            <DeleteButton ready={ready} />
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setTyped("");
              }}
              className={button({ variant: "ghost" })}
            >
              Cancel
            </button>
          </div>
        </ActionForm>
      )}
    </section>
  );
}

function DeleteButton({ ready }: { ready: boolean }) {
  // Disabled until the word is typed; SubmitButton adds the spinner while the delete runs.
  return ready ? (
    <SubmitButton pendingLabel="Deleting…" className={`${button({ variant: "primary" })} bg-bad text-background hover:bg-bad/90`}>
      Delete everything
    </SubmitButton>
  ) : (
    <button type="button" disabled className={`${button({ variant: "primary" })} bg-bad text-background`}>
      Delete everything
    </button>
  );
}
