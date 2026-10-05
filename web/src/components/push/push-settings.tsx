"use client";

import { useEffect, useOptimistic, useState, useTransition } from "react";
import { removePushSubscription, savePushSettings, savePushSubscription, sendTestPush } from "@/app/actions/push";
import { button, chip } from "@/components/button-styles";
import { useServerAction } from "@/components/form";
import { iosNeedsInstall } from "@/lib/install-state";

const HOURS = [null, 7, 8, 9, 10] as const;

function keyBytes(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

type Support = "checking" | "install" | "unsupported" | "denied" | "off" | "on";

const sameKey = (a: ArrayBuffer | null, b: Uint8Array) => a !== null && new Uint8Array(a).join() === b.join();

async function detectSupport(vapidKey: string): Promise<Support> {
  // iPhone Safari has no PushManager outside the installed app, so the toggle could never work there.
  if (iosNeedsInstall()) return "install";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.register("/sw.js");
  let sub = await reg.pushManager.getSubscription();
  if (sub && !sameKey(sub.options.applicationServerKey, keyBytes(vapidKey))) {
    // Made with an older VAPID key: the push service would refuse every send to it. Start over with the current key.
    await sub.unsubscribe();
    sub =
      Notification.permission === "granted"
        ? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(vapidKey) }).catch(() => null)
        : null;
  }
  // Save it again on every visit: the server may have lost it (a failed save, a deleted row, a rotated endpoint).
  if (sub) await saveQuietly(sub);
  return sub ? "on" : "off";
}

function saveQuietly(sub: PushSubscription) {
  return fetch("/api/push/resync", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(sub.toJSON()),
  }).catch(() => undefined);
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
  const { run, isBusy, error } = useServerAction();
  // The master switch flips on the tap; the browser prompt and the server confirm it.
  const [deviceOn, flipDevice] = useOptimistic(support === "on", (_: boolean, next: boolean) => next);

  useEffect(() => {
    detectSupport(vapidKey)
      .then(setSupport)
      .catch(() => setSupport("unsupported"));
  }, [vapidKey]);

  const [test, setTest] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, startTest] = useTransition();
  const sendTest = () =>
    startTest(async () => {
      setTest(null);
      try {
        const r = await sendTestPush();
        setTest({ ok: !r.error, text: r.error ?? r.note ?? "Sent." });
      } catch {
        setTest({ ok: false, text: "Couldn't reach the server. Check your connection." });
      }
    });

  const enable = () =>
    run(
      async () => {
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
      },
      { id: "device", optimistic: () => flipDevice(true) },
    );

  const disable = () =>
    run(
      async () => {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await removePushSubscription(sub.endpoint);
          await sub.unsubscribe();
        }
        setSupport("off");
      },
      { id: "device", optimistic: () => flipDevice(false) },
    );

  // Each switch is its own control: only the one being saved is busy, and a failure undoes just that one.
  const update = (key: keyof typeof settings, value: boolean | number | null) => {
    const previous = settings[key];
    setSettings({ ...settings, [key]: value });
    run(() => savePushSettings({ ...settings, [key]: value }), {
      id: key,
      rollback: () => setSettings((now) => ({ ...now, [key]: previous })),
    });
  };

  if (support === "install") {
    return (
      <p className="text-small text-text-2" data-testid="push-install-first">
        Install the app to get notifications. On iPhone they only work from the Home Screen app.
      </p>
    );
  }
  if (support === "unsupported") {
    return <p className="text-small text-mute">This browser can&apos;t show notifications.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {support === "denied" && <p className="text-small text-warn">Notifications are blocked for 90x in this browser&apos;s settings.</p>}
      <div className="flex flex-col rounded-xl border border-line bg-surface">
        <Toggle
          label="Push notifications"
          hint="This device"
          on={deviceOn}
          onChange={(on) => (on ? enable() : disable())}
          disabled={isBusy("device") || support === "checking" || support === "denied"}
        />
        <Toggle
          label="Evening streak"
          hint="8 pm, only if missions are left"
          on={settings.evening}
          onChange={(evening) => update("evening", evening)}
          disabled={isBusy("evening")}
        />
        <Toggle
          label="Friend activity"
          hint="When a friend checks in, at most every 3 hours each"
          on={settings.friends}
          onChange={(friends) => update("friends", friends)}
          disabled={isBusy("friends")}
        />
        <Toggle
          label="Weekly review"
          hint="Sunday 6 pm, when Coach's review of your week is ready"
          on={settings.weekly}
          onChange={(weekly) => update("weekly", weekly)}
          disabled={isBusy("weekly")}
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
                  disabled={isBusy("morningHour")}
                  onClick={() => update("morningHour", h)}
                  className={chip(on)}
                >
                  {h == null ? "Off" : `${h} am`}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      {support === "on" && (
        <div className="flex flex-col gap-2">
          <button type="button" onClick={sendTest} disabled={testing} className={`${button({ size: "sm" })} self-start`}>
            {testing ? "Sending…" : "Send me a test notification"}
          </button>
          {test && (
            <p role={test.ok ? "status" : "alert"} className={`text-small ${test.ok ? "text-text-2" : "text-bad"}`}>
              {test.text}
            </p>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="text-small text-bad">
          {error}
        </p>
      )}
    </div>
  );
}
