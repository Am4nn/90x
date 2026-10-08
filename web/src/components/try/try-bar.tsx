"use client";

import { Suspense } from "react";
import { ConsentNote } from "@/components/landing/consent-note";
import { GoogleCta, SignInNotice } from "@/components/landing/sign-in-buttons";
import { TRY_CTA } from "@/lib/landing/try-cards";

/**
 * Pinned to the bottom of the screen from the first answer on, and kept while the visitor tries the
 * other cards: the way in, the consent line (never dropped) and the next card. It sits outside the page's
 * container, which would otherwise be its containing block.
 */
export function TryBar({ nextLabel, onNext }: { nextLabel: string; onNext: () => void }) {
  return (
    <div data-try="bar" className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-background motion-safe:animate-bar-in">
      <div className="mx-auto flex max-w-160 flex-col items-stretch gap-0.5 px-4 pt-3 pb-bar-pad">
        <GoogleCta spot="try" label={TRY_CTA} compact className="w-full" />
        <ConsentNote className="mt-1.5 text-center" />
        <Suspense>
          <SignInNotice spot="try" className="text-center" />
        </Suspense>
        <button
          type="button"
          onClick={onNext}
          className="relative h-10 self-center rounded-sm px-1 text-nav font-medium text-mute underline decoration-line-2 underline-offset-4 hover:text-text-2"
        >
          {nextLabel}
        </button>
      </div>
    </div>
  );
}
