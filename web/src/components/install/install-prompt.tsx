"use client";

import { useEffect, useSyncExternalStore } from "react";
import { button } from "@/components/button-styles";
import { bannerDue } from "@/lib/install";
import {
  captureInstallPrompt,
  currentInstallMode,
  dismissedAt,
  dismissInstall,
  runInstallPrompt,
  subscribeInstall,
} from "@/lib/install-state";

/** Mounted once in the root layout so the browser's install event is never missed. */
export function InstallCapture() {
  useEffect(() => captureInstallPrompt(), []);
  return null;
}

function IosSteps() {
  return (
    <ol className="flex list-decimal flex-col gap-1 pl-5 text-small text-text-2">
      <li>
        Tap <strong className="font-semibold text-text">Share</strong> in Safari&apos;s toolbar.
      </li>
      <li>
        Choose <strong className="font-semibold text-text">Add to Home Screen</strong>, then Add.
      </li>
      <li>Open 90x from your Home Screen. Notifications on iPhone only work in the installed app.</li>
    </ol>
  );
}

/**
 * "Install app" entry. `row` sits in Settings and is always there until installed; `banner` is for
 * Today and can be dismissed for a week. Nothing shows once the app is already installed.
 */
export function InstallPrompt({ variant }: { variant: "banner" | "row" }) {
  const mode = useSyncExternalStore(subscribeInstall, currentInstallMode, () => "none" as const);
  const due = useSyncExternalStore(
    subscribeInstall,
    () => bannerDue(dismissedAt(), Date.now()),
    () => false,
  );
  if (mode === "none" || (variant === "banner" && !due)) return null;

  return (
    <section
      aria-label="Install the app"
      className="flex flex-col gap-2.5 rounded-xl border border-line bg-surface px-4 py-3.5"
      data-testid={`install-${variant}`}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex flex-col gap-0.5">
          <span className="font-semibold text-text">{mode === "ios" ? "Add 90x to your Home Screen" : "Install the app"}</span>
          <span className="text-small text-mute">
            {mode === "ios"
              ? "Full screen, and the only way to get notifications on iPhone."
              : "Opens full screen from your home screen, like any app."}
          </span>
        </span>
        {variant === "banner" && (
          <button type="button" onClick={dismissInstall} aria-label="Dismiss" className="-m-1 p-1 text-mute hover:text-text">
            <svg
              viewBox="0 0 20 20"
              className="size-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              aria-hidden
            >
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        )}
      </div>
      {mode === "ios" ? (
        <IosSteps />
      ) : (
        <button type="button" onClick={runInstallPrompt} className={`${button({ size: "sm" })} self-start`}>
          Install app
        </button>
      )}
    </section>
  );
}
