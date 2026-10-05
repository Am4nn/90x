import { Suspense } from "react";
import { Reveal } from "./reveal";
import { GoogleCta, SignInNotice } from "./sign-in-buttons";

/** The last word: "Day 1 starts with a card." and a second way in. */
export function CloseSection() {
  return (
    <section data-landing="close" className="relative z-1 mt-close-top">
      <div className="relative mx-auto flex max-w-content flex-col gap-6 px-gutter pb-close-bottom">
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
