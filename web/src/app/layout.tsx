import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { ServiceWorker } from "@/components/offline/service-worker";
import { Splash } from "@/components/splash/splash";
import { splashHeadScript } from "@/components/splash/splash-script";
import "./globals.css";
import { LAUNCH_IMAGES, launchImageHref, launchImageMedia } from "@/lib/brand/launch-images";
import { siteUrl } from "@/lib/site-url";
import { Providers } from "./providers";

// Self-hosted (scripts/fetch-fonts.ts) so the build never depends on Google Fonts.
const sora = localFont({ src: "./fonts/sora-latin.woff2", variable: "--font-sora", weight: "600 700", display: "swap" });
const manrope = localFont({ src: "./fonts/manrope-latin.woff2", variable: "--font-manrope", weight: "500 700", display: "swap" });

const DESCRIPTION =
  "Interview-ready in 90 days, with friends. Daily missions, a question feed that makes you recall, and a coach that knows your progress.";

// Icons come from the file conventions in this folder (favicon.ico, icon.svg,
// apple-icon.png) and the link card from opengraph-image.tsx; all are drawn by scripts/make-icons.ts.
export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: { default: "90x", template: "%s · 90x" },
  description: DESCRIPTION,
  applicationName: "90x",
  openGraph: { siteName: "90x", title: "90x", description: DESCRIPTION, type: "website", locale: "en_US" },
  twitter: { card: "summary_large_image", title: "90x", description: DESCRIPTION },
  // Opens full screen from the Home Screen. The page doesn't pad for the notch, so the status bar stays opaque.
  appleWebApp: { capable: true, title: "90x", statusBarStyle: "black" },
  // Next renders only the standard mobile-web-app-capable; older iOS Safari reads only the Apple name.
  other: { "apple-mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  themeColor: "#0a0c10",
  colorScheme: "dark",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The head script adds splash classes to <html> before React hydrates it.
    <html lang="en" className={`${sora.variable} ${manrope.variable} dark h-full`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: splashHeadScript }} />
        {/* iOS launch images; the metadata API has no field for them. */}
        {LAUNCH_IMAGES.map((screen) => (
          <link
            key={launchImageHref(screen)}
            rel="apple-touch-startup-image"
            media={launchImageMedia(screen)}
            href={launchImageHref(screen)}
          />
        ))}
      </head>
      <body className="min-h-full">
        <Splash />
        <Providers>{children}</Providers>
        <ServiceWorker />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
