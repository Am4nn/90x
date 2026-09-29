"use client";

import { useRouter } from "next/navigation";
import { useActionState, useCallback, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { PRIMARY } from "@/components/button-styles";

// Pending and error handling for forms and buttons (after Curfew's ui.tsx).
// Server actions return a FormState instead of throwing.

export type FormState = { ok?: boolean; error?: string; note?: string };
export type FormAction = (state: FormState, form: FormData) => Promise<FormState>;

/** Submit button that disables itself and shows a pending label while its form submits. */
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
      {mine ? (pendingLabel ?? children) : children}
    </button>
  );
}

/**
 * Run a server action from a plain button; stays pending until the refreshed
 * page arrives. With `refresh: false` the caller applies the action's result
 * itself and the page isn't re-rendered.
 */
export function useServerAction({ refresh = true }: { refresh?: boolean } = {}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(
    (fn: () => Promise<FormState | void>) => {
      setError(null);
      startTransition(async () => {
        try {
          const result = await fn();
          if (result && result.error) setError(result.error);
          else if (refresh) router.refresh();
        } catch {
          setError("That didn't go through. Check your connection and try again.");
        }
      });
    },
    [router, refresh],
  );
  return { run, pending, error, clearError: () => setError(null) };
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
