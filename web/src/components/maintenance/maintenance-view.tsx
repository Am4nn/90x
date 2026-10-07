import { Suspense } from "react";
import { Ren } from "@/components/coach/ren";
import { DotWordmark } from "@/components/landing/dot-wordmark";
import { jetbrains } from "@/components/landing/fonts";
import { SignInNotice } from "@/components/landing/sign-in-buttons";
import { visibleMessage } from "@/lib/maintenance/rules";
import { SUPPORT_EMAIL } from "@/lib/trust/report-rules";
import { AdminSignIn, CheckAgain } from "./maintenance-actions";

/**
 * The page everyone but admins sees while 90x is down (maintenance mock #page).
 * The heading always shows; the admin's message only when there is one, with no default text.
 * `signIn` offers a quiet admin sign-in, because the only other way in is the landing page,
 * which is this page now; it is left out under the break-glass, which blocks admins too.
 */
export function MaintenanceView({ message, signIn }: { message: string | null; signIn: boolean }) {
  const text = visibleMessage(message);
  return (
    <main className={`${jetbrains.variable} relative flex min-h-dvh flex-col overflow-hidden`}>
      <DotWordmark centered />
      <div
        data-landing="close-content"
        className="relative mx-auto flex w-full max-w-content flex-1 flex-col items-center justify-center px-5 pt-page-top pb-page-bottom text-center"
      >
        {/* Room for the wordmark, which the canvas behind draws. */}
        <div aria-hidden="true" data-landing="mark-box" className="landing-mark-space w-full" />
        <div aria-hidden="true" className="mt-6 flex items-start gap-1.5">
          <Ren asleep size={56} />
          <span className="font-term text-small font-bold text-ren">
            z<sup>z</sup>
          </span>
        </div>
        <h1 className="mt-7 max-w-lg font-display text-title font-bold tracking-tight sm:text-display">90x is down for maintenance.</h1>
        <p className="mt-3 max-w-sm text-text-2">Your progress is safe. We will be back soon.</p>
        {text && (
          <p data-maintenance="message" className="mt-5 max-w-md rounded-xl border border-line-2 bg-surface px-4 py-3 text-text">
            {text}
          </p>
        )}
        <CheckAgain />
        <p className="mt-7 text-small text-mute">
          Questions?{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="font-term text-text-2 underline-offset-4 hover:underline">
            {SUPPORT_EMAIL}
          </a>
        </p>
        {signIn && (
          <div className="mt-4 flex flex-col items-center gap-1">
            <AdminSignIn />
            <Suspense>
              <SignInNotice spot="maintenance" />
            </Suspense>
          </div>
        )}
      </div>
    </main>
  );
}
