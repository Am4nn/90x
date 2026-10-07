import { Suspense } from "react";
import { DEV_NOTE, DEV_NOTE_LABEL, HERO_FOOTNOTE, SUBHEAD, SUBHEAD_PHONE } from "@/lib/landing/copy";
import { HEADLINE_LEAD, HEADLINE_SENTENCE } from "@/lib/landing/scramble";
import { ConsentNote } from "./consent-note";
import { HeroChat } from "./hero-chat";
import { HeroHeadline } from "./hero-headline";
import { PHONE_PAGE_BOX } from "./phone-page";
import { RenCanvas } from "./ren-canvas";
import { ScrollHint } from "./scroll-hint";
import { DeletedNotice, GoogleCta, SignInNotice } from "./sign-in-buttons";
import { TryLink } from "./try-link";

/**
 * Ren, a changing headline and the two ways in. One DOM for both layouts, restyled by the landing
 * root's width (`@wide:` from 760px, `@max-wide:` below):
 * - phone: page one of five (PHONE_PAGE_BOX). A column that is exactly one screen: nav (laid over the top),
 *   headline, subhead, Ren (takes what is left, 160px at least), the buttons, and the dev note as a muted line last (hidden while a sign-in notice shows, which needs the room);
 * - wide: two columns, the dev note a pill above the headline.
 * `order-*` puts the wrapper's children in the phone's order; the wrapper is `display: contents` on a
 * phone so its children line up with Ren in one column. The `!` paddings win over the box's 32px:
 * page one starts under the nav and keeps the mock's thin bottom (the 360x640 budget has no room for 32px).
 */
export function Hero() {
  return (
    <section
      data-landing="hero"
      data-page="hero"
      className={`${PHONE_PAGE_BOX} group/hero mx-auto flex max-w-content flex-col @max-wide:pt-page-nav! @max-wide:pb-hero-bottom! @wide:min-h-hero @wide:flex-row @wide:flex-wrap @wide:content-center @wide:items-center @wide:gap-x-12 @wide:gap-y-4 @wide:px-gutter @wide:pt-hero-top @wide:pb-24`}
    >
      <div className="contents @wide:flex @wide:min-w-0 @wide:flex-[1.1_1_440px] @wide:flex-col @wide:gap-6.5">
        {/* An honest word from the developer: this page is the showpiece, the app itself is quiet. */}
        <p
          data-landing="dev-note"
          className="order-5 text-center text-tag leading-snug font-medium text-balance text-mute @max-wide:group-has-[[data-landing=notice]]/hero:hidden @wide:order-0 @wide:flex @wide:items-center @wide:gap-2 @wide:self-start @wide:rounded-full @wide:border @wide:border-line-2 @wide:bg-surface @wide:px-3 @wide:py-1.5 @wide:text-left @wide:font-semibold"
        >
          <span aria-hidden="true" className="hidden size-1.5 flex-none rounded-full bg-ren-hot @wide:block" />
          <span>
            <span data-landing="dev-note-label" className="font-term text-ren-hot">
              {DEV_NOTE_LABEL}
            </span>{" "}
            {DEV_NOTE}
          </span>
        </p>
        <h1 className="order-1 font-display text-hero-sm font-bold tracking-hero text-wrap @wide:text-hero">
          {/* The animated lines are for the eye; this is what is read out. */}
          <span className="sr-only">{HEADLINE_SENTENCE}</span>
          <span aria-hidden="true" className="block whitespace-nowrap">
            {HEADLINE_LEAD}
          </span>
          <HeroHeadline />
        </h1>
        <p className="order-2 max-w-lede text-body font-medium text-text-2 @wide:text-lede">
          <span className="@wide:hidden">{SUBHEAD_PHONE}</span>
          <span className="hidden @wide:inline">{SUBHEAD}</span>
        </p>
        <div className="order-4 flex flex-col items-stretch gap-2.5 @wide:items-start">
          <div className="flex flex-col gap-3 self-stretch @wide:flex-row">
            <TryLink className="w-full @wide:w-auto" />
            <GoogleCta spot="hero" className="w-full @wide:w-auto" />
          </div>
          <p className="text-center text-small font-medium text-mute @wide:text-left">{HERO_FOOTNOTE}</p>
          <ConsentNote className="text-center @wide:text-left" />
          <Suspense>
            <SignInNotice spot="hero" className="text-center @wide:text-left" />
            <DeletedNotice className="text-center @wide:text-left" />
          </Suspense>
        </div>
      </div>
      <div className="landing-ren-fit order-3 flex min-h-ren-min min-w-0 flex-1 basis-0 flex-col items-center justify-center gap-2 @wide:flex-[1_1_380px]">
        <div data-landing="ren-stage" className="relative aspect-square max-w-full @wide:h-auto @wide:w-full @wide:max-w-ren">
          <RenCanvas />
        </div>
        <HeroChat />
      </div>
      <ScrollHint />
    </section>
  );
}
