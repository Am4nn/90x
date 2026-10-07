import { HowLink } from "./how-link";
import { NavSignIn } from "./sign-in-buttons";

/**
 * The top bar. Wide: the wordmark, "How it works" and a small Sign in, 80px tall plus the status bar's inset.
 * Phone: the logo only (the Google button is already on page one), laid over the top 56px of that page, so
 * page one is exactly one screen with the nav inside it. Installed on an iPhone the page runs under a
 * translucent status bar, so the bar starts below it.
 */
export function Nav() {
  return (
    <header className="pt-safe relative z-1 mx-auto flex max-w-content items-center gap-3.5 px-gutter pb-5 @max-wide:absolute @max-wide:inset-x-0 @max-wide:top-0 @max-wide:h-page-nav @max-wide:items-end @max-wide:px-4 @max-wide:pt-0 @max-wide:pb-4 @wide:gap-6">
      <span className="font-display text-wordmark font-bold tracking-mark">
        90
        <span data-landing="logo-x" className="text-cyan">
          x
        </span>
      </span>
      <div className="flex-1" />
      <HowLink />
      <NavSignIn className="hidden @wide:block" />
    </header>
  );
}
