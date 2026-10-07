import Link from "next/link";
import { NavSignIn } from "@/components/landing/sign-in-buttons";

/** "← 90x" back to the landing page, and a small Sign in. Sticky on a phone. */
export function TopBar() {
  return (
    <header className="sticky top-0 z-9 bg-background pt-inset-top md:static">
      <div className="mx-auto flex h-14 max-w-160 items-center justify-between px-4 md:h-17 md:px-5">
        <Link
          href="/"
          aria-label="Back to 90x home"
          className="flex items-center gap-2 rounded-sm font-display text-wordmark font-bold tracking-mark text-text"
        >
          <span aria-hidden="true" className="font-sans text-heading font-semibold text-text-2">
            ←
          </span>
          <span aria-hidden="true">
            90<span className="text-cyan">x</span>
          </span>
        </Link>
        <NavSignIn />
      </div>
    </header>
  );
}
