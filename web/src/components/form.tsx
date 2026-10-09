"use client";

import { useRouter } from "next/navigation";
import { useActionState, useCallback, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { PRIMARY } from "@/components/button-styles";
import { withBusy } from "@/lib/busy";

// Pending and error handling for forms and buttons (after Curfew's ui.tsx).
// Server actions return a FormState instead of throwing.

/** `xp` and `bonus` are what the action earned (see XpGain), when it earned any. */
export type FormState = { ok?: boolean; error?: string; note?: string; xp?: number; bonus?: number };
export type FormAction = (state: FormState, form: FormData) => Promise<FormState>;

/** A tiny CSS-only spinner for busy buttons. It inherits the text colour. */
function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="inline-block size-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
    />
  );
}

/** A button's content while it is busy: the spinner, then the label. An icon-only button passes `swap`, so the
 *  spinner takes the icon's place instead of squeezing in beside it. */
export function Busy({ busy, swap = false, children }: { busy: boolean; swap?: boolean; children: React.ReactNode }) {
  if (busy && swap) return <Spinner />;
  return (
    <>
      {busy && <Spinner />}
      {children}
    </>
  );
}

/**
 * Submit button that disables itself and shows a spinner while its form submits.
 * The label stays (or becomes `pendingLabel`), so the tap answers on the same frame.
 */
export function SubmitButton({
  children,
  pendingLabel,
  className = PRIMARY,
  name,
  value,
  title,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
  name?: string;
  value?: string;
  title?: string;
}) {
  const { pending, data } = useFormStatus();
  // With several submit buttons in one form, only the pressed one shows the label.
  const mine = pending && (!name || data?.get(name) === value);
  return (
    <button type="submit" name={name} value={value} title={title} disabled={pending} aria-busy={mine || undefined} className={className}>
      <Busy busy={mine}>{mine ? (pendingLabel ?? children) : children}</Busy>
    </button>
  );
}

type RunOptions = {
  /** Which control this is, so only it looks busy. Omit for a single-button caller. */
  id?: string;
  /** Applied on the click's own frame, before the server answers (e.g. a useOptimistic setter). */
  optimistic?: () => void;
  /** Undo for an optimistic update held in plain state; useOptimistic rolls itself back. */
  rollback?: () => void;
};

/**
 * Run a server action from a plain button. The click answers at once: `optimistic`
 * runs on the same frame and the control goes busy. It is busy only while the action
 * itself runs; the page refresh follows inside the same transition, so an optimistic
 * value holds until the fresh page lands but never keeps a button looking stuck.
 * On an error nothing refreshes, the optimistic value rolls back and the error shows.
 * With `refresh: false` the caller applies the action's result itself.
 */
export function useServerAction({ refresh = true }: { refresh?: boolean } = {}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [gain, setGain] = useState<{ xp: number; bonus: number } | null>(null);
  const run = useCallback(
    (fn: () => Promise<FormState | void>, { id = "", optimistic, rollback }: RunOptions = {}) => {
      setError(null);
      setGain(null);
      setBusy((set) => withBusy(set, id, true));
      startTransition(async () => {
        optimistic?.();
        try {
          const result = await fn();
          // Plain state, set after the await: urgent, so the button frees up before the refresh lands.
          setBusy((set) => withBusy(set, id, false));
          if (result && result.error) {
            rollback?.();
            setError(result.error);
          } else {
            if (result && ((result.xp ?? 0) > 0 || (result.bonus ?? 0) > 0)) setGain({ xp: result.xp ?? 0, bonus: result.bonus ?? 0 });
            if (refresh) router.refresh();
          }
        } catch {
          setBusy((set) => withBusy(set, id, false));
          rollback?.();
          setError("That didn't go through. Check your connection and try again.");
        }
      });
    },
    [router, refresh],
  );
  /** True while the control with this id (default: the only one) is waiting on its action. */
  const isBusy = (id = "") => busy.has(id);
  return { run, pending: busy.size > 0, isBusy, error, gain, clearError: () => setError(null) };
}

/** Form bound to a FormAction: shows its error or note inline under the fields. */
export function ActionForm({
  action,
  children,
  className = "flex flex-col gap-3",
}: {
  action: FormAction;
  children: React.ReactNode;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className={className}>
      {children}
      <FormMessage state={state} />
    </form>
  );
}

export function FormMessage({ state }: { state: FormState }) {
  if (state.error)
    return (
      <p role="alert" className="text-small text-bad">
        {state.error}
      </p>
    );
  if (state.note) return <p className="text-small text-ok">{state.note}</p>;
  return null;
}
