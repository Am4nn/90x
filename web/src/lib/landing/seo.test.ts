import { describe, expect, it } from "vitest";
import { SEO_TITLE, SUBHEAD } from "./copy";
import { HEADLINE_LEAD, PHRASES } from "./scramble";
import { jsonLdScript, landingJsonLd, OG_ALT, OG_LINES } from "./seo";

describe("landingJsonLd", () => {
  const ld = landingJsonLd("https://90x.amanarya.com");

  it("is a free SoftwareApplication with the subhead as its description", () => {
    expect(ld).toMatchObject({
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "90x",
      description: SUBHEAD,
      applicationCategory: "EducationalApplication",
      operatingSystem: "Web",
      url: "https://90x.amanarya.com/",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    });
  });

  it("claims no rating, review or user count", () => {
    expect(JSON.stringify(ld)).not.toMatch(/aggregateRating|ratingValue|review|userCount|interactionStatistic/i);
  });
});

describe("jsonLdScript", () => {
  it("cannot close its own script tag or break out of it", () => {
    const sep = String.fromCharCode(0x2028, 0x2029);
    const value = {
      name: "</script><script>alert(1)</script>",
      other: `a${sep}b c`,
    };
    const text = jsonLdScript(value);
    expect(text).not.toContain("</script>");
    expect(text).not.toContain("<");
    expect(text).not.toMatch(/[\u2028\u2029]/);
    expect(JSON.parse(text)).toEqual(value);
  });
});

describe("the share image copy", () => {
  it("is the headline on two lines, and the alt text is the title and the description", () => {
    expect(OG_LINES).toEqual([HEADLINE_LEAD, PHRASES[0]]);
    expect(OG_LINES).toEqual(["Backend interview prep", "that plans your day."]);
    expect(OG_ALT).toBe(`${SEO_TITLE}. ${SUBHEAD}`);
  });
});
