// What search engines and link previews read from the landing page. Pure, so it is tested without a browser.
import { SEO_TITLE, SUBHEAD } from "./copy";
import { HEADLINE_LEAD, PHRASES } from "./scramble";

export interface SoftwareApplicationLd {
  "@context": "https://schema.org";
  "@type": "SoftwareApplication";
  name: string;
  description: string;
  applicationCategory: string;
  operatingSystem: string;
  url: string;
  offers: { "@type": "Offer"; price: string; priceCurrency: string };
}

export function landingJsonLd(origin: string): SoftwareApplicationLd {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "90x",
    description: SUBHEAD,
    applicationCategory: "EducationalApplication",
    operatingSystem: "Web",
    url: new URL("/", origin).href,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  };
}

/** JSON for an inline <script>: "<" and the two line separators are escaped so no value can end the tag or the string. */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/** The link-preview image: the headline in two lines. */
export const OG_LINES = [HEADLINE_LEAD, PHRASES[0]] as const;
export const OG_ALT = `${SEO_TITLE}. ${SUBHEAD}`;
