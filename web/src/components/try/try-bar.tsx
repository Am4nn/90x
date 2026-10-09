"use client";

import { Suspense } from "react";
import { ConsentNote } from "@/components/landing/consent-note";
import { GoogleCta, SignInNotice } from "@/components/landing/sign-in-buttons";
import { TRY_CTA } from "@/lib/landing/try-cards";

/**
 * Pinned to the bottom of the screen from the first answer on, and kept while the visitor tries the
 * other cards: the way in, and the consent line (never dropped). It sits outside the page's
 * container, which would otherwise be its containing block.
 */
export function TryBar() {
  return (
    <div data-try="bar" className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-background motion-safe:animate-bar-in">
      <div className="mx-auto flex max-w-160 flex-col items-stretch gap-0.5 px-4 pt-3 pb-bar-pad">
        <GoogleCta spot="try" label={TRY_CTA} compact className="w-full" />
        <ConsentNote className="mt-1.5 text-center" />
        <Suspense>
          <SignInNotice spot="try" className="text-center" />
        </Suspense>
      </div>
    </div>
  );
}
