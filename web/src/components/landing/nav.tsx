import { NavSignIn } from "./sign-in-buttons";

/** The top bar: the 90x wordmark and a small Sign in. It is 80px tall, which the hero's height counts on. */
export function Nav() {
  return (
    <header className="relative z-1 mx-auto flex max-w-content items-center gap-6 px-gutter py-5">
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
