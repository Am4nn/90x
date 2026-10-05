import { CloseSection } from "@/components/landing/close-section";
import { PinnedDemo } from "@/components/landing/demo";
import { FeedSection } from "@/components/landing/feed-section";
import { jetbrains } from "@/components/landing/fonts";
import { Footer } from "@/components/landing/footer";
import { Hero } from "@/components/landing/hero";
import { Nav } from "@/components/landing/nav";
import { ParticleStage } from "@/components/landing/particle-stage";
import { SmoothScroll } from "@/components/landing/smooth-scroll";
import { ForgetOfflineData } from "@/components/offline/forget-offline-data";

// The public front door, and the only way in: a static page, the same for everyone. Signed-in
// visitors never see it; the proxy sends them to Today (lib/auth/landing-gate.ts), which is
// what lets this page stay static. Built to the approved design.
export default function Home() {
  return (
    // A size container: the cqi sizes and the @wide: layout follow this element's width, not the window's.
    // overflow-clip, not hidden, so the pinned demo can stick (sticky breaks inside a scroll container).
    <div data-landing="root" className={`${jetbrains.variable} @container relative overflow-clip bg-background text-text`}>
      {/* First, so its sticky overlay spans the whole page. */}
      <ParticleStage />
      <Nav />
      <main>
        <Hero />
        <PinnedDemo />
        <FeedSection />
        <CloseSection />
      </main>
      <Footer />
      <SmoothScroll />
      <ForgetOfflineData />
    </div>
  );
}
