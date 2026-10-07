"use client";

import { AlertDialog } from "@base-ui/react/alert-dialog";
import { useActionState, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { button } from "@/components/button-styles";
import { ActionForm, type FormState, FormMessage, SubmitButton } from "@/components/form";
import { MAINTENANCE_MESSAGE_MAX, type MaintenanceState } from "@/lib/maintenance/rules";
import { reapplyMaintenance, setMaintenance } from "./actions";

export const INPUT = "h-11 rounded-xl border border-line-2 bg-surface px-3.5 text-text outline-none focus:border-cyan";

/** Whether what the proxy obeys (Redis) differs from what is stored. The message only matters while on. */
function split(on: boolean, message: string, live: MaintenanceState | null): boolean {
  return !live || live.on !== on || (on && live.message !== message);
}

/**
 * The kill switch, at the top of Settings (maintenance mock #admin, #confirm). Its own form
 * and action, so saving any other setting never touches it. Turning it on asks first, then saves at once;
 * turning it off saves at once; the message has its own save. The pill shows what the app obeys right now,
 * and a split between that and the stored switch shows a warning with Re-apply.
 */
export function MaintenanceForm({ on, message, live }: { on: boolean; message: string; live: MaintenanceState | null }) {
  const [down, setDown] = useState(on);
  const [confirming, setConfirming] = useState(false);
  const [text, setText] = useState(message);
  // After a save the page re-renders with what is stored: show that, not the click (and keep the form's "Saved.").
  const [stored, setStored] = useState({ on, message });
  if (stored.on !== on || stored.message !== message) {
    setStored({ on, message });
    setDown(on);
    setText(message);
  }
  const toggle = useRef<HTMLButtonElement>(null);
  const [state, action] = useActionState(async (previous: FormState, form: FormData) => {
    const result = await setMaintenance(previous, form);
    // A failed save leaves the switch as stored, not as clicked.
    if (result.error) setDown(on);
    return result;
  }, {});
  const save = (next: boolean) => {
    // The hidden field must hold the new value before the form is read.
    flushSync(() => {
      setDown(next);
      setConfirming(false);
    });
    toggle.current?.form?.requestSubmit();
  };
  const liveOn = live?.on ?? false;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display text-heading font-semibold">Maintenance</h2>
      <form action={action} className="rounded-xl border border-line bg-surface">
        <div className="flex items-center gap-4 px-4 py-4.5">
          <input type="hidden" name="maintenance" value={down ? "on" : ""} />
          <button
            ref={toggle}
            type="button"
            role="switch"
            aria-checked={down}
            aria-label="Maintenance mode"
            onClick={() => (down ? save(false) : setConfirming(true))}
            className={`relative h-9 w-16 shrink-0 rounded-full transition-colors ${down ? "bg-warn/20" : "bg-ok/20"}`}
          >
            <span
              aria-hidden="true"
              className={`absolute top-1 size-7 rounded-full transition-all ${down ? "left-1 bg-warn" : "left-8 bg-ok"}`}
            />
          </button>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="font-display text-heading font-bold text-text">{down ? "App is in maintenance" : "App is live"}</span>
            <span className="text-small text-mute">{down ? "Only admins can use the app." : "Everyone can use the app."}</span>
          </span>
          {live && (
            <span
              title="What the app is doing right now"
              className={`shrink-0 rounded-full px-2.5 py-1 text-tag font-bold max-sm:hidden ${liveOn ? "bg-warn/15 text-warn" : "bg-ok/15 text-ok"}`}
            >
              {liveOn ? "Maintenance" : "Live"}
            </span>
          )}
        </div>
        <div className="flex flex-col gap-2.5 border-t border-line px-4 py-3.5">
          <span className="flex flex-col">
            <label htmlFor="maintenance-message" className="font-semibold text-text">
              Message on the maintenance page
            </label>
            <span id="maintenance-message-hint" className="text-small text-mute">
              Optional. One line, shown under the main text. Leave empty for none.
            </span>
          </span>
          <input
            id="maintenance-message"
            aria-describedby="maintenance-message-hint"
            name="maintenanceMessage"
            type="text"
            maxLength={MAINTENANCE_MESSAGE_MAX}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="We're upgrading the database, back by 6pm IST"
            className={`${INPUT} w-full`}
          />
        </div>
        <div className="flex items-center justify-between gap-3 px-4 pb-3.5">
          <SubmitButton pendingLabel="Saving…" className={button({ size: "sm" })}>
            Save message
          </SubmitButton>
          <span className="tabular text-tag text-mute">
            {text.length} / {MAINTENANCE_MESSAGE_MAX}
          </span>
        </div>
        <div className="px-4 pb-3.5 empty:hidden">
          <FormMessage state={state} />
        </div>
      </form>
      {split(on, message, live) && (
        <div role="alert" className="flex flex-col gap-3 rounded-xl border border-warn/40 bg-warn/10 p-4 text-small text-text">
          <p>
            {live
              ? `The app is ${live.on ? "in maintenance" : "live"} right now, but the switch is saved as ${on ? "in maintenance" : "live"}${
                  live.on === on ? " with a different message" : ""
                }.`
              : "Couldn't read what the app is doing right now."}{" "}
            Re-apply sends the saved switch to the app.
          </p>
          <ActionForm action={reapplyMaintenance} className="flex flex-col gap-2">
            <div>
              <SubmitButton pendingLabel="Re-applying…" className={button({ size: "sm" })}>
                Re-apply
              </SubmitButton>
            </div>
          </ActionForm>
        </div>
      )}
      <p className="text-small text-mute">Admins keep full access and see a banner on every page while this is on.</p>
      <AlertDialog.Root open={confirming} onOpenChange={setConfirming}>
        <AlertDialog.Portal>
          <AlertDialog.Backdrop className="fixed inset-0 z-40 bg-background/70" />
          <AlertDialog.Popup className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md rounded-2xl border border-line-2 bg-surface-2 p-6 outline-none sm:top-1/2 sm:bottom-auto sm:-translate-y-1/2">
            <AlertDialog.Title className="font-display text-title font-bold text-text">Turn on maintenance mode?</AlertDialog.Title>
            <AlertDialog.Description className="mt-2.5 text-text-2">
              Everyone except admins will see the maintenance page and be unable to use the app.
            </AlertDialog.Description>
            <p className="mt-2.5 text-small text-mute">Their progress is kept. You can turn it off any time from here.</p>
            <div className="mt-6 flex flex-wrap justify-end gap-2.5">
              <AlertDialog.Close className={`${button({ size: "lg" })} max-sm:flex-1`}>Cancel</AlertDialog.Close>
              <button
                type="button"
                onClick={() => save(true)}
                className="inline-flex h-11 items-center justify-center rounded-xl bg-warn px-5 font-semibold text-background hover:bg-warn/90 max-sm:flex-1"
              >
                Turn on
              </button>
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </section>
  );
}
