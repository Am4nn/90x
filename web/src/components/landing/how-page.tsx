import { HOW_STEPS, HOW_TITLE } from "@/lib/landing/how";
import { HowIcon } from "./how-icon";
import { PHONE_PAGE } from "./phone-page";
import { ProofTiles } from "./proof-tiles";

/**
 * Page four on a phone: the title at the top, the three steps as one block, the proof numbers as four
 * tiles at the bottom. `justify-between` spreads the three, so no gap opens under the steps.
 */
export function HowPage() {
  return (
    <section
      data-landing="how-phone"
      data-page="how"
      id="how-phone"
      aria-labelledby="how-phone-h"
      className={`${PHONE_PAGE} @max-wide:justify-between`}
    >
      <h2 id="how-phone-h" className="flex-none font-display text-page font-bold tracking-hero">
        {HOW_TITLE}
      </h2>
      <ol className="m-0 flex list-none flex-col gap-step-phone p-0 @max-wide:pr-3">
        {HOW_STEPS.map((step) => (
          <li key={step.title} className="flex items-start gap-3.5">
            <HowIcon icon={step.icon} tile="size-10" />
            <div className="flex min-w-0 flex-col gap-1">
              <h3 className="font-display text-step-phone font-semibold tracking-q [@media(min-height:720px)]:text-step-phone-tall">
                {step.title}
              </h3>
              <p className="text-desc-phone font-medium text-pretty text-text-2 [@media(min-height:720px)]:text-desc-phone-tall">
                {step.text}
              </p>
            </div>
          </li>
        ))}
      </ol>
      <ProofTiles />
    </section>
  );
}
