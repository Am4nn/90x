import { Suspense } from "react";
import { HEADLINE_LEAD, HEADLINE_SENTENCE } from "@/lib/landing/scramble";
import { ConsentNote } from "./consent-note";
import { HeroChat } from "./hero-chat";
import { HeroHeadline } from "./hero-headline";
import { RenCanvas } from "./ren-canvas";
import { ScrollHint } from "./scroll-hint";
import { DeletedNotice, GoogleCta, SignInNotice } from "./sign-in-buttons";

/**
 * Ren, a changing headline and the sign-in. On a phone it is exactly one screen tall
 * (headline, line, Ren filling what is left, the button); wide, two columns.
 * Narrow versus wide is the landing root's own width (@wide:), not the window's.
 */
export function Hero() {
  return (
    <section
      data-landing="hero"
      className="relative z-1 mx-auto flex h-hero min-h-hero max-w-content flex-col gap-3.5 px-5 pt-1 pb-2.5 @wide:h-auto @wide:flex-row @wide:flex-wrap @wide:content-center @wide:items-center @wide:gap-x-12 @wide:gap-y-4 @wide:px-gutter @wide:pt-hero-top @wide:pb-24"
    >
      {/* On a phone this wrapper disappears, so its three children line up with Ren and the hint in one column. */}
      <div className="contents @wide:flex @wide:min-w-0 @wide:flex-[1.1_1_440px] @wide:flex-col @wide:gap-6.5">
        {/* An honest word from the developer: this page is the showpiece, the app itself is quiet. */}
        <p className="flex items-center gap-2 self-start rounded-full border border-line-2 bg-surface px-3 py-1.5 text-tag font-semibold text-mute">
          <span aria-hidden="true" className="size-1.5 flex-none rounded-full bg-ren-hot" />
          <span>
            <span className="font-term text-text-2">dev note:</span> I got carried away. The app is calmer.
          </span>
        </p>
        <h1 className="max-w-headline font-display text-hero-sm font-bold tracking-hero text-wrap @wide:text-hero">
          {/* The animated lines are for the eye; this is what is read out. */}
          <span className="sr-only">{HEADLINE_SENTENCE}</span>
          <span aria-hidden="true" className="block">
            {HEADLINE_LEAD}
          </span>
          <HeroHeadline />
        </h1>
        <p className="max-w-lede text-body font-medium text-text-2 @wide:text-lede">
          This is Ren. It marks every answer and plans tomorrow from what you missed.
        </p>
        <div className="order-2 flex flex-col items-stretch gap-2.5 @wide:items-start">
          <GoogleCta spot="hero" className="w-full @wide:w-auto" />
          <p className="text-center text-small font-medium text-mute @wide:text-left">Google sign-in. Installs on phone and desktop.</p>
          <ConsentNote className="text-center @wide:text-left" />
          <Suspense>
            <SignInNotice spot="hero" className="text-center @wide:text-left" />
            <DeletedNotice className="text-center @wide:text-left" />
          </Suspense>
        </div>
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 basis-0 flex-col items-center justify-center gap-2 @wide:flex-[1_1_380px]">
        <div data-landing="ren-stage" className="relative aspect-square h-full max-w-full @wide:h-auto @wide:w-full @wide:max-w-ren">
          <RenCanvas />
        </div>
        <HeroChat />
      </div>
      <ScrollHint />
    </section>
  );
}
