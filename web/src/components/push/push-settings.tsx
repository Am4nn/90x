"use client";

import { useEffect, useState } from "react";
import { removePushSubscription, savePushSettings, savePushSubscription, sendTestPush } from "@/app/actions/push";
import { button, chip } from "@/components/button-styles";
import { useServerAction } from "@/components/form";

const HOURS = [null, 7, 8, 9, 10] as const;

function keyBytes(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

type Support = "checking" | "unsupported" | "denied" | "off" | "on";

async function detectSupport(): Promise<Support> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.register("/sw.js");
  return (await reg.pushManager.getSubscription()) ? "on" : "off";
}

function Toggle({
  label,
  hint,
  on,
  onChange,
  disabled,
}: {
  label: string;
  hint: string;
  on: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className="flex w-full items-center justify-between gap-4 border-t border-line px-4 py-3.5 text-left first:border-0 disabled:opacity-50"
    >
      <span className="flex flex-col">
        <span className="font-semibold text-text">{label}</span>
        <span className="text-small text-mute">{hint}</span>
      </span>
      <span className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? "bg-cyan" : "bg-line-2"}`}>
        <span
          className={`absolute top-0.5 size-5 rounded-full transition-transform ${on ? "translate-x-5 bg-on-cyan" : "translate-x-0.5 bg-text-2"}`}
        />
      </span>
    </button>
  );
}

export function PushSettings({
  vapidKey,
  initial,
}: {
  vapidKey: string;
  initial: { evening: boolean; friends: boolean; weekly: boolean; morningHour: number | null };
}) {
  const [support, setSupport] = useState<Support>("checking");
  const [settings, setSettings] = useState(initial);
  const { run, pending, error } = useServerAction();
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    detectSupport().then(setSupport);
  }, []);

  const enable = () =>
    run(async () => {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setSupport(permission === "denied" ? "denied" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(vapidKey) }));
      const result = await savePushSubscription(sub.toJSON());
      if (!result.error) setSupport("on");
      return result;
    });

  const disable = () =>
    run(async () => {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await removePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setSupport("off");
    });

  const update = (next: typeof settings) => {
    setSettings(next);
    run(() => savePushSettings(next));
  };

  const test = () =>
    run(async () => {
      const r = await sendTestPush();
      setNote(r.note ?? null);
      return r;
    });

  if (support === "unsupported") {
    return (
      <p className="text-small text-mute">This browser can&apos;t show notifications. On iPhone, add 90x to your Home Screen first.</p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {support === "denied" && <p className="text-small text-warn">Notifications are blocked for 90x in this browser&apos;s settings.</p>}
      <div className="flex flex-wrap items-center gap-2">
        {support === "on" ? (
          <>
            <button type="button" onClick={test} disabled={pending} className={button()}>
              Send a test
            </button>
            <button type="button" onClick={disable} disabled={pending} className={button({ variant: "ghost" })}>
              Turn off on this device
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={enable}
            disabled={pending || support === "checking" || support === "denied"}
            aria-busy={pending || undefined}
            className={button({ variant: "primary" })}
          >
            {pending ? "Turning on…" : "Turn on notifications"}
          </button>
        )}
      </div>

      <div className="flex flex-col rounded-xl border border-line bg-surface">
        <Toggle
          label="Evening reminder"
          hint="8 pm, only if missions are left"
          on={settings.evening}
          onChange={(evening) => update({ ...settings, evening })}
          disabled={pending}
        />
        <Toggle
          label="Friend activity"
          hint="When a friend checks in, at most every 3 hours each"
          on={settings.friends}
          onChange={(friends) => update({ ...settings, friends })}
          disabled={pending}
        />
        <Toggle
          label="Weekly review"
          hint="Sunday 6 pm, when Coach's review of your week is ready"
          on={settings.weekly}
          onChange={(weekly) => update({ ...settings, weekly })}
          disabled={pending}
        />
        <div className="flex flex-col gap-2.5 border-t border-line px-4 py-3.5">
          <span className="flex flex-col">
            <span className="font-semibold text-text">Morning plan</span>
            <span className="text-small text-mute">Today&apos;s missions and time</span>
          </span>
          <div className="flex flex-wrap gap-2">
            {HOURS.map((h) => {
              const on = settings.morningHour === h;
              return (
                <button
                  key={h ?? "off"}
                  type="button"
                  disabled={pending}
                  onClick={() => update({ ...settings, morningHour: h })}
                  className={chip(on)}
                >
                  {h == null ? "Off" : `${h} am`}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-small text-bad">
          {error}
        </p>
      )}
      {note && !error && <p className="text-small text-ok">{note}</p>}
    </div>
  );
}
