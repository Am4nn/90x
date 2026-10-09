"use client";

import type { ReactNode } from "react";
import { ActionForm, SubmitButton } from "@/components/form";
import type { Settings } from "@/lib/settings-rules";
import { updateSettings } from "./actions";
import { INPUT } from "./maintenance-form";
const BOX = "size-5 shrink-0 accent-cyan";

/** One settings row: the label and its hint on the left, the control on the right. */
function Row({ label, hint, top = false, children }: { label: string; hint: string; top?: boolean; children: ReactNode }) {
  return (
    <label className={`flex ${top ? "items-start" : "items-center"} justify-between gap-4 border-t border-line px-4 py-3.5 first:border-0`}>
      <span className="flex flex-col">
        <span className="font-semibold text-text">{label}</span>
        <span className="text-small text-mute">{hint}</span>
      </span>
      {children}
    </label>
  );
}

function Toggle({ name, label, hint, on }: { name: string; label: string; hint: string; on: boolean }) {
  return (
    <Row label={label} hint={hint} top>
      <input type="checkbox" name={name} aria-label={label} defaultChecked={on} className={BOX} />
    </Row>
  );
}

function Cap({ name, label, hint, value }: { name: string; label: string; hint: string; value: number }) {
  return (
    <Row label={label} hint={hint}>
      <span className="flex items-center gap-1.5 text-text-2">
        $
        <input
          name={name}
          aria-label={label}
          type="number"
          inputMode="decimal"
          min={0.01}
          max={1000}
          step="any"
          defaultValue={value}
          className={`${INPUT} w-32`}
        />
      </span>
    </Row>
  );
}

function DateField({ name, label, hint, value }: { name: string; label: string; hint: string; value: string | null }) {
  return (
    <Row label={label} hint={hint}>
      <input name={name} aria-label={label} type="date" defaultValue={value ?? ""} className={`${INPUT} w-44`} />
    </Row>
  );
}

/** One form for the general settings, saved together. The maintenance switch has its own form (maintenance-form.tsx). */
export function SettingsForm({ settings }: { settings: Settings }) {
  return (
    <ActionForm action={updateSettings} className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h2 className="font-display text-heading font-semibold">Access</h2>
        <div className="rounded-xl border border-line bg-surface">
          <Toggle
            name="autoApprove"
            label="Approve new sign-ins automatically"
            hint="Off: every new person waits until you let them in. People already waiting stay waiting."
            on={settings.autoApprove}
          />
        </div>
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="font-display text-heading font-semibold">AI spend</h2>
        <div className="rounded-xl border border-line bg-surface">
          <Cap name="aiDailyCapUsd" label="Daily cap" hint="You get an email at 80% of it." value={settings.aiDailyCapUsd} />
          <Cap name="aiMonthlyCapUsd" label="Monthly cap" hint="You get an email at 80% of it." value={settings.aiMonthlyCapUsd} />
          <Cap
            name="aiUserDailyCapUsd"
            label="Per person, per day"
            hint="The most one person can spend on AI in a day. Past it their AI features rest until tomorrow."
            value={settings.aiUserDailyCapUsd}
          />
          <Cap
            name="aiLifetimeCapUsd"
            label="Lifetime cap"
            hint="Total AI spend ever. AI stops completely when it is reached, whatever the switch below says. You get an email at 80%."
            value={settings.aiLifetimeCapUsd}
          />
          <Toggle
            name="aiHardStop"
            label="Stop AI at twice a cap"
            hint="Grading, Coach, mocks, reviews and lessons stop. Cards, Today and the Library keep working. Off: AI never stops on spend."
            on={settings.aiHardStop}
          />
          <Toggle
            name="aiPaused"
            label="Pause AI now"
            hint="Stops the same features immediately, whatever the spend. Use it if something looks wrong."
            on={settings.aiPaused}
          />
        </div>
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="font-display text-heading font-semibold">Launch</h2>
        <div className="rounded-xl border border-line bg-surface">
          <DateField
            name="launchDate"
            label="Launch date"
            hint="The day the launch post goes out. Starts the 30-day Launch gate on Analytics. Clear it to hide the gate."
            value={settings.launchDate}
          />
        </div>
      </section>
      <div>
        <SubmitButton pendingLabel="Saving…">Save settings</SubmitButton>
      </div>
    </ActionForm>
  );
}
