// The words the landing page and its link previews share, so the hero, the meta
// description and the Open Graph image can never drift apart.
import { KIND_COUNT_WORD } from "./wall-cards";

/** Desktop: two sentences. Also the page's meta description. */
export const SUBHEAD =
  "Pick 30, 60 or 90 days. 90x picks each day's work from your weakest areas across DSA, system design, Java, SQL and CS core, and checks every answer.";

/** Phone: one sentence after the length choice, so the page's two buttons stay on the first screen. */
export const SUBHEAD_PHONE = "Pick 30, 60 or 90 days. Daily work from your weakest areas across DSA, system design, Java, SQL and CS core.";

/** The label is drawn in Ren's red, the rest muted. */
export const DEV_NOTE_LABEL = "dev note:";
export const DEV_NOTE = "the landing page shows off. The app inside is calm.";

/** The landing page's tab title and link-preview title. */
export const SEO_TITLE = "90x, interview prep that plans your day";

/** The primary button: it goes to /try and asks for nothing. */
export const TRY_LINK_LABEL = "Try a card, no sign-in";
export const HERO_FOOTNOTE = "Google sign-in. Installs on phone and desktop.";
export const DEMO_PHONE_TITLE = "Watch Ren mark a card.";

/** The Feed wall's heading on a phone and its caption on desktop: "Ten", from the app's own count. */
export const CARDS_TITLE = `${KIND_COUNT_WORD} kinds of card. Every one marked.`;

/** The phone close's sub, under "Day 1 starts with a card.". */
export const CLOSE_SUB = "Backend interview prep. Five areas, one plan.";

/** /try's own title (the layout adds " · 90x") and description: the one indexable page with real interview keywords this round. */
export const TRY_SEO_TITLE = "Try a backend interview card, no sign-in";
export const TRY_SEO_DESCRIPTION =
  "Free backend interview practice with no sign-in: a system design caching question, a DSA sliding-window complexity question and a SQL join question, each checked the moment you answer.";
