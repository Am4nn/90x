"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { button } from "@/components/button-styles";
import { ActionForm, SubmitButton } from "@/components/form";
import { decide, deleteUser } from "./actions";

type Kind = "waiting" | "active" | "blocked";
type Mode = "block" | "delete" | null;

const DANGER =
  "inline-flex h-9 items-center justify-center rounded-lg border border-bad/40 px-3 text-small font-semibold whitespace-nowrap text-bad transition-colors hover:bg-bad/10 max-sm:h-11";
const DANGER_SOLID =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-bad px-4 text-small font-semibold whitespace-nowrap text-background transition-colors hover:bg-bad/90 disabled:opacity-50 max-sm:h-11";
// 44px on a phone, the button's own height from sm up.
const TOUCH = "max-sm:h-11";

/** Cancel inside a confirm form: disabled while the form is submitting, so the row can't close mid-delete. */
function CancelButton({ onClick }: { onClick: () => void }) {
  const { pending } = useFormStatus();
  return (
    <button type="button" onClick={onClick} disabled={pending} className={`${button({ variant: "secondary" })} max-sm:h-11`}>
      Cancel
    </button>
  );
}

/**
 * One row of /admin/users with its actions. Block and Delete… expand the row in place into a
 * confirmation (like Settings' delete): focus moves into it, and Cancel puts focus back on the
 * button that opened it. Let in and Unblock act at once. Never rendered for an admin (the page shows
 * a plain row instead): decide and deleteUser refuse admins, so no button is offered.
 */
export function UserRow({
  userId,
  name,
  email,
  meta,
  kind,
}: {
  userId: string;
  name: string;
  email: string;
  /** The grey second line: email, dates. */
  meta: string;
  kind: Kind;
}) {
  const [mode, setMode] = useState<Mode>(null);
  const blockBtn = useRef<HTMLButtonElement | null>(null);
  const deleteBtn = useRef<HTMLButtonElement | null>(null);
  const returnTo = useRef<Mode>(null);

  useEffect(() => {
    if (mode === null && returnTo.current) {
      (returnTo.current === "block" ? blockBtn : deleteBtn).current?.focus();
      returnTo.current = null;
    }
  }, [mode]);
  const confirmRef = useRef<HTMLDivElement | null>(null);
  // Opening a confirm moves focus into it (the email field, or Block's confirm button); Escape cancels.
  useEffect(() => {
    const box = confirmRef.current;
    if (!mode || !box) return;
    box.querySelector<HTMLElement>("input[name=confirm], button[type=submit]")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      returnTo.current = mode;
      setMode(null);
    };
    box.addEventListener("keydown", onKey);
    return () => box.removeEventListener("keydown", onKey);
  }, [mode]);
  const cancel = () => {
    returnTo.current = mode;
    setMode(null);
  };

  const label = name || email;
  if (mode) {
    return (
      <div
        role="group"
        aria-label={mode === "delete" ? `Delete ${label}` : `Block ${label}`}
        className={`flex flex-col gap-3 px-4 py-3.5 ${mode === "delete" ? "bg-bad/5 ring-1 ring-bad/40 ring-inset" : ""}`}
        ref={confirmRef}
      >
        <div className="min-w-0">
          <div className="truncate font-semibold">{label}</div>
          <div className="truncate text-small text-mute">{email}</div>
        </div>
        {mode === "delete" ? (
          <ActionForm action={deleteUser} className="flex flex-col gap-3">
            <input type="hidden" name="userId" value={userId} />
            <p className="text-small text-text-2">
              <strong className="text-text">Delete {label}&rsquo;s account?</strong> This deletes the account and all its data for good, and
              emails {email} that it happened.
            </p>
            <label htmlFor={`confirm-${userId}`} className="text-small text-text-2">
              Type their email to confirm.
            </label>
            <input
              id={`confirm-${userId}`}
              name="confirm"
              type="text"
              autoComplete="off"
              spellCheck={false}
              className="h-11 w-full rounded-xl border border-bad/50 bg-background px-4 text-body text-text focus:border-bad"
            />
            <div className="flex flex-wrap gap-2">
              <SubmitButton pendingLabel="Deleting…" className={DANGER_SOLID}>
                Delete everything
              </SubmitButton>
              <CancelButton onClick={cancel} />
            </div>
          </ActionForm>
        ) : (
          <ActionForm action={decide} className="flex flex-col gap-3">
            <input type="hidden" name="userId" value={userId} />
            <input type="hidden" name="status" value="rejected" />
            <p className="text-small text-text-2">
              <strong className="text-text">Block {label}?</strong> They can still sign in but can&rsquo;t use 90x. Their data is kept, and
              you can unblock them.
            </p>
            <div className="flex flex-wrap gap-2">
              <SubmitButton pendingLabel="Blocking…" className={DANGER_SOLID}>
                Block
              </SubmitButton>
              <CancelButton onClick={cancel} />
            </div>
          </ActionForm>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
      <div className="min-w-0">
        <div className="truncate font-semibold">{label}</div>
        <div className="truncate text-small text-mute">{meta}</div>
      </div>
      <div className="flex gap-2">
        {kind === "waiting" && (
          <ActionForm action={decide} className="contents">
            <input type="hidden" name="userId" value={userId} />
            <input type="hidden" name="status" value="approved" />
            <SubmitButton pendingLabel="Letting in…" className={`${button({ variant: "primary", size: "sm" })} ${TOUCH}`}>
              Let in
            </SubmitButton>
          </ActionForm>
        )}
        {kind === "blocked" && (
          <ActionForm action={decide} className="contents">
            <input type="hidden" name="userId" value={userId} />
            <input type="hidden" name="status" value="approved" />
            <SubmitButton pendingLabel="Unblocking…" className={`${button({ size: "sm" })} ${TOUCH}`}>
              Unblock
            </SubmitButton>
          </ActionForm>
        )}
        {kind !== "blocked" && (
          <button ref={blockBtn} type="button" onClick={() => setMode("block")} className={`${button({ size: "sm" })} ${TOUCH}`}>
            Block
          </button>
        )}
        {kind !== "waiting" && (
          <button ref={deleteBtn} type="button" onClick={() => setMode("delete")} className={DANGER}>
            Delete…
          </button>
        )}
      </div>
    </div>
  );
}
