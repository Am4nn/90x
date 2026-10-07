import { describe, expect, it } from "vitest";
import {
  CARDS_TITLE,
  DEMO_PHONE_TITLE,
  DEV_NOTE,
  DEV_NOTE_LABEL,
  HERO_FOOTNOTE,
  SEO_TITLE,
  SUBHEAD,
  SUBHEAD_PHONE,
  TRY_LINK_LABEL,
} from "./copy";
import { HEADLINE_LEAD, HEADLINE_SENTENCE, PHRASES, STILL_HEADLINE } from "./scramble";

describe("the hero copy is the approved copy", () => {
  it("has the fixed first line and the three rotating phrases, in order", () => {
    expect(HEADLINE_LEAD).toBe("Backend interview prep");
    expect([...PHRASES]).toEqual(["that plans your day.", "that checks every answer.", "that remembers what you miss."]);
  });

  it("reads the whole headline once for screen readers", () => {
    expect(HEADLINE_SENTENCE).toBe("Backend interview prep that plans your day, checks every answer and remembers what you miss.");
  });

  it("shows the first phrase whole when nothing moves", () => {
    expect(STILL_HEADLINE).toEqual({ phrase: 0, landed: "that plans your day.", noise: "" });
  });

  it("has the phone subhead and the longer desktop subhead, in the design's exact words", () => {
    expect(SUBHEAD_PHONE).toBe(
      "Pick 30, 60 or 90 days. Daily work from your weakest areas across DSA, system design, Java, SQL and CS core.",
    );
    expect(SUBHEAD).toBe(
      "Pick 30, 60 or 90 days. 90x picks each day's work from your weakest areas across DSA, system design, Java, SQL and CS core, and checks every answer.",
    );
    // The phone line is shorter: it drops the clause the desktop adds.
    expect(SUBHEAD_PHONE.length).toBeLessThan(SUBHEAD.length);
  });

  it("has the dev note, its label, the two buttons' words and the SEO title", () => {
    expect(DEV_NOTE_LABEL).toBe("dev note:");
    expect(DEV_NOTE).toBe("the landing page shows off. The app inside is calm.");
    expect(TRY_LINK_LABEL).toBe("Try a card, no sign-in");
    expect(HERO_FOOTNOTE).toBe("Google sign-in. Installs on phone and desktop.");
    expect(SEO_TITLE).toBe("90x, interview prep that plans your day");
  });

  it("names the kinds of card as the app does, and the demo as the mock does", () => {
    expect(CARDS_TITLE).toBe("Ten kinds of card. Every one marked.");
    expect(DEMO_PHONE_TITLE).toBe("Watch Ren mark a card.");
  });
});
