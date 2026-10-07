import { Suspense } from "react";
import { CLOSE_SUB } from "@/lib/landing/copy";
import { ConsentNote } from "./consent-note";
import { DotWordmark } from "./dot-wordmark";
import { FOOTER_LINKS, FooterLink } from "./footer";
import { PHONE_PAGE_BOX } from "./phone-page";
import { Reveal } from "./reveal";
import { GoogleCta, SignInNotice } from "./sign-in-buttons";
import { TryLink } from "./try-link";

/**
 * The last word: a "90x" in dots, "Day 1 starts with a card." and both ways in. One DOM for both layouts.
 * Wide: the wordmark, then the heading with the buttons beside it. Phone: page five of five, one column that is
 * exactly a screen: the wordmark, the heading and the sub centred as one group, the buttons, the consent line
 * and the footer at the bottom (the page's own footer is not laid out on a phone: it would sit below the last
 * snap page). On a phone the Reveals are `display: contents`, so nothing slides in.
 */
export function CloseSection() {
  return (
    <section data-landing="close" data-page="close" aria-labelledby="close-h" className={`${PHONE_PAGE_BOX} mt-close-top @max-wide:mt-0`}>
      <DotWordmark />
      <div
        data-landing="close-content"
        className="relative mx-auto flex max-w-content flex-wrap items-center justify-between gap-x-10 gap-y-5 px-gutter pb-close-bottom @max-wide:h-full @max-wide:w-full @max-wide:flex-col @max-wide:flex-nowrap @max-wide:items-stretch @max-wide:gap-5 @max-wide:px-2 @max-wide:pb-0"
      >
        {/* The group the phone centres: the wordmark's room, the heading, the sub. Wide, the wrapper vanishes and its three children are items of the wrapping row above (the placeholder is full width, so it takes a row of its own). */}
        <div className="contents @max-wide:flex @max-wide:flex-1 @max-wide:flex-col @max-wide:items-center @max-wide:justify-center @max-wide:gap-3 @max-wide:text-center">
          {/* Room for the wordmark, which the canvas behind draws; its height follows the wordmark's size. */}
          <div aria-hidden="true" data-landing="mark-box" className="landing-mark-space w-full" />
          <Reveal className="@max-wide:contents">
            <h2 id="close-h" data-landing="day-one" className="font-display text-close font-bold tracking-close @max-wide:text-close-sm">
              Day 1 starts with a card.
            </h2>
          </Reveal>
          <p className="text-body font-medium text-mute @wide:hidden">{CLOSE_SUB}</p>
        </div>
        <Reveal late className="@max-wide:contents">
          <div className="flex flex-col gap-2.5 @max-wide:-mx-2 @max-wide:gap-3">
            <div className="flex flex-col gap-3 @wide:flex-row">
              <TryLink />
              <GoogleCta spot="close" />
            </div>
            <ConsentNote className="@max-wide:text-center" />
            <Suspense>
              <SignInNotice spot="close" className="@max-wide:text-center" />
            </Suspense>
            {/* A phone's footer. `role` is explicit because a footer inside a section is not a landmark by itself, and the page's own footer is hidden here. */}
            <footer role="contentinfo" className="flex flex-col items-center gap-0.5 text-tag font-medium text-mute @wide:hidden">
              <nav aria-label="Footer links" className="flex flex-wrap justify-center gap-x-4">
                {FOOTER_LINKS.map((link) => (
                  <FooterLink key={link.href} href={link.href} className="py-1.5">
                    {link.label}
                  </FooterLink>
                ))}
              </nav>
            </footer>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
