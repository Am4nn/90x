import { Suspense } from "react";
import { DotWordmark } from "./dot-wordmark";
import { Reveal } from "./reveal";
import { GoogleCta, SignInNotice } from "./sign-in-buttons";

/** The last word: a "90x" in dots, "Day 1 starts with a card." and a second way in. */
export function CloseSection() {
  return (
    <section data-landing="close" className="relative z-1 mt-close-top">
      <DotWordmark />
      <div data-landing="close-content" className="relative mx-auto flex max-w-content flex-col gap-6 px-gutter pb-close-bottom">
        {/* Room for the wordmark, which the canvas behind draws; its height follows the wordmark's size. */}
        <div aria-hidden="true" className="landing-mark-space" />
        <Reveal>
          <div className="flex flex-wrap items-center justify-between gap-x-10 gap-y-5">
            <h2 data-landing="day-one" className="font-display text-close font-bold tracking-close">
              Day 1 starts with a card.
            </h2>
            <div className="flex flex-col gap-2.5">
              <GoogleCta spot="close" />
              <Suspense>
                <SignInNotice spot="close" />
              </Suspense>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
