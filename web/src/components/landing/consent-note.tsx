import Link from "next/link";

// The tap area is 44px tall, but on a pseudo-element, so the line does not move and the focus ring stays on the
// words. It reaches mostly downward and only a little upward, so it never reaches the Google button above; the
// things below that take taps (the phone footer links, /try's Next card, the hero's dev note) sit above it.
const LINK = "relative underline underline-offset-2 hover:text-text-2 after:absolute after:inset-x-0 after:-top-2 after:-bottom-5";

/** Small print under the Google buttons: signing in is the agreement. */
export function ConsentNote({ className = "" }: { className?: string }) {
  return (
    <p data-landing="consent" className={`text-tag leading-normal font-medium text-mute ${className}`}>
      By continuing you agree to the{" "}
      <Link href="/terms" className={LINK}>
        Terms
      </Link>{" "}
      and{" "}
      <Link href="/privacy" className={LINK}>
        Privacy Policy
      </Link>
      .
    </p>
  );
}
