import type { Metadata } from "next";
import { CardsPage } from "@/components/landing/cards-page";
import { CloseSection } from "@/components/landing/close-section";
import { PinnedDemo } from "@/components/landing/demo";
import { DemoPhone } from "@/components/landing/demo-phone";
import { FeedSection } from "@/components/landing/feed-section";
import { doto, jetbrains } from "@/components/landing/fonts";
import { Footer } from "@/components/landing/footer";
import { Hero } from "@/components/landing/hero";
import { HowPage } from "@/components/landing/how-page";
import { HowStrip } from "@/components/landing/how-strip";
import { Nav } from "@/components/landing/nav";
import { Pager } from "@/components/landing/pager";
import { ParticleStage } from "@/components/landing/particle-stage";
import { ProofStrip } from "@/components/landing/proof-strip";
import { SmoothScroll } from "@/components/landing/smooth-scroll";
import { SnapScroll } from "@/components/landing/snap-scroll";
import { WallCard } from "@/components/landing/wall-card";
import { ForgetOfflineData } from "@/components/offline/forget-offline-data";
import { SEO_TITLE, SUBHEAD } from "@/lib/landing/copy";
import { jsonLdScript, landingJsonLd } from "@/lib/landing/seo";
import { WALL_CARDS } from "@/lib/landing/wall-cards";
import { siteUrl } from "@/lib/site-url";

// A page-level openGraph replaces the layout's whole object (Next merges one level deep), so it repeats siteName, type and locale, and the link-card images.
export const metadata: Metadata = {
  title: { absolute: SEO_TITLE },
  description: SUBHEAD,
  alternates: { canonical: "/" },
  openGraph: {
    siteName: "90x",
    title: SEO_TITLE,
    description: SUBHEAD,
    type: "website",
    locale: "en_US",
    images: ["/opengraph-image"],
  },
  twitter: {
    card: "summary_large_image",
    title: SEO_TITLE,
    description: SUBHEAD,
    images: ["/twitter-image"],
  },
};

// The public front door, and the only way in: a static page, the same for everyone. Signed-in
// visitors never see it; the proxy sends them to Today (lib/auth/landing-gate.ts), which is
// what lets this page stay static. Built to the approved design.
export default function Home() {
  return (
    // A size container: the cqi sizes and the @wide: layout follow this element's width, not the window's.
    // overflow-clip, not hidden, so the pinned demo can stick (sticky breaks inside a scroll container).
    <div data-landing="root" className={`${jetbrains.variable} ${doto.variable} @container relative overflow-clip bg-background text-text`}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(landingJsonLd(siteUrl().origin)),
        }}
      />
      {/* First, so its sticky overlay spans the whole page. */}
      <ParticleStage />
      <Pager />
      <Nav />
      <main>
        <Hero />
        <PinnedDemo />
        <DemoPhone />
        <ProofStrip />
        <FeedSection />
        <CardsPage
          cards={WALL_CARDS.map((card) => (
            <WallCard key={card.kind} card={card} />
          ))}
        />
        <HowStrip />
        <HowPage />
        <CloseSection />
      </main>
      <Footer />
      <SmoothScroll />
      <SnapScroll />
      <ForgetOfflineData />
    </div>
  );
}
