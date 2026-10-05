// Pure rules for the "install the app" prompts. The browser-facing wiring lives in install-state.ts.

export const DISMISS_DAYS = 7;

type Env = { userAgent: string; platform?: string; maxTouchPoints?: number };

/** iPhone, iPod, or an iPad (which reports itself as a Mac but has a touch screen). */
export function isIos({ userAgent, platform, maxTouchPoints }: Env): boolean {
  if (/iPhone|iPad|iPod/.test(userAgent)) return true;
  return platform === "MacIntel" && (maxTouchPoints ?? 0) > 1;
}

/** Safari on iOS, not Chrome/Firefox/Edge/Opera or an in-app browser, which have no Add to Home Screen in the share sheet we describe. */
export function isIosSafari(env: Env): boolean {
  return isIos(env) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA|FBAN|FBAV|Instagram/.test(env.userAgent);
}

/** Running as an installed app: iOS sets navigator.standalone, everyone else uses the display-mode media query. */
export function isStandalone(navigatorStandalone: boolean | undefined, displayModeStandalone: boolean): boolean {
  return navigatorStandalone === true || displayModeStandalone;
}

/** A dismissed banner stays away for a week. */
export function bannerDue(dismissedAt: number | null, now: number): boolean {
  if (dismissedAt === null || !Number.isFinite(dismissedAt)) return true;
  return now - dismissedAt >= DISMISS_DAYS * 86_400_000;
}

export type InstallMode = "none" | "prompt" | "ios";

/** What to offer: the native prompt where the browser gave us one, the how-to on iOS Safari, nothing once installed. */
export function installMode(opts: { standalone: boolean; hasPrompt: boolean; iosSafari: boolean }): InstallMode {
  if (opts.standalone) return "none";
  if (opts.hasPrompt) return "prompt";
  return opts.iosSafari ? "ios" : "none";
}
