import type { Metadata } from "next";
import { jetbrains } from "@/components/landing/fonts";
import { TopBar } from "@/components/try/top-bar";
import { TryClient } from "@/components/try/try-client";
import { TRY_SEO_DESCRIPTION, TRY_SEO_TITLE } from "@/lib/landing/copy";

// Public and static: nothing here reads the visitor, and a signed-in visitor is sent on to Today by
// the proxy (lib/auth/landing-gate.ts), as from `/`. Its own title and description: it is the one
// indexable page with real interview keywords. A page-level openGraph replaces the layout's whole
// object (Next merges one level deep), so it repeats siteName, type and locale, and the link-card images (the root ones are dropped too).
export const metadata: Metadata = {
  title: TRY_SEO_TITLE,
  description: TRY_SEO_DESCRIPTION,
  alternates: { canonical: "/try" },
  openGraph: {
    siteName: "90x",
    title: TRY_SEO_TITLE,
    description: TRY_SEO_DESCRIPTION,
    type: "website",
    locale: "en_US",
    url: "/try",
    images: ["/opengraph-image"],
  },
  twitter: {
    card: "summary_large_image",
    title: TRY_SEO_TITLE,
    description: TRY_SEO_DESCRIPTION,
    images: ["/twitter-image"],
  },
};

export default function TryPage() {
  // The JetBrains variable is applied here, as on the landing root, so the code blocks render in the mono face.
  return (
    <div className={jetbrains.variable}>
      <TopBar />
      <TryClient />
    </div>
  );
}
