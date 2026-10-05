import Link from "next/link";

/** Small print under the Google buttons: signing in is the agreement. */
export function ConsentNote({ className = "" }: { className?: string }) {
  return (
    <p data-landing="consent" className={`text-tag leading-normal font-medium text-mute ${className}`}>
      By continuing you agree to the{" "}
      <Link href="/terms" className="underline underline-offset-2 hover:text-text-2">
        Terms
      </Link>{" "}
      and{" "}
      <Link href="/privacy" className="underline underline-offset-2 hover:text-text-2">
        Privacy Policy
      </Link>
      .
    </p>
  );
}
