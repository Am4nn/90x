import { HOW_STEPS, HOW_SUB, HOW_TITLE } from "@/lib/landing/how";
import { HowIcon } from "./how-icon";
import { Reveal } from "./reveal";

/** Three steps above the close. The nav's "How it works" scrolls here. Desktop only; the phone's page is `HowPage`. */
export function HowStrip() {
  return (
    <section
      id="how"
      data-landing="how"
      aria-labelledby="how-h"
      className="relative z-1 mt-how-top scroll-mt-4 border-t border-line @max-wide:hidden"
    >
      <div className="mx-auto max-w-content px-gutter pt-feed-top">
        <Reveal>
          <div className="flex flex-col gap-feed-gap">
            <div className="flex flex-wrap items-end justify-between gap-x-12 gap-y-4">
              <h2 id="how-h" className="max-w-feed font-display text-feed font-bold tracking-hero">
                {HOW_TITLE}
              </h2>
              <p className="text-sub font-medium text-text-2">{HOW_SUB}</p>
            </div>
            <ol className="grid grid-cols-3 gap-3.5">
              {HOW_STEPS.map((step, i) => (
                <li key={step.title} className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5.5">
                  <div className="flex items-center justify-between">
                    <HowIcon icon={step.icon} />
                    <span aria-hidden="true" className="font-term text-small font-bold text-ren-hot">
                      {`0${i + 1}`}
                    </span>
                  </div>
                  <h3 className="font-display text-title font-semibold tracking-title">{step.title}</h3>
                  <p className="text-body font-medium text-pretty text-text-2">{step.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
