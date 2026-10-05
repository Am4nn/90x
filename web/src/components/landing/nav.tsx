import { NavSignIn } from "./sign-in-buttons";

/**
 * The top bar: the 90x wordmark and a small Sign in. It is 80px tall plus the status bar's inset, which the
 * hero's height counts on. Installed on an iPhone the page runs under a translucent status bar, so the bar
 * starts below it (`pt-safe`), as every app page does.
 */
export function Nav() {
  return (
    <header className="pt-safe relative z-1 mx-auto flex max-w-content items-center gap-6 px-gutter pb-5">
      <span className="font-display text-wordmark font-bold tracking-mark">
        90
        <span data-landing="logo-x" className="text-cyan">
          x
        </span>
      </span>
      <div className="flex-1" />
      <NavSignIn />
    </header>
  );
}
