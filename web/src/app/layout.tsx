import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { ServiceWorker } from "@/components/offline/service-worker";
import "./globals.css";
import { Providers } from "./providers";

// Self-hosted (scripts/fetch-fonts.ts) so the build never depends on Google Fonts.
const sora = localFont({ src: "./fonts/sora-latin.woff2", variable: "--font-sora", weight: "600 700", display: "swap" });
const manrope = localFont({ src: "./fonts/manrope-latin.woff2", variable: "--font-manrope", weight: "500 700", display: "swap" });

export const metadata: Metadata = {
  title: { default: "90x", template: "%s · 90x" },
  description: "Train. Measure. Adapt.",
  applicationName: "90x",
  icons: {
    // favicon.ico comes from the app/favicon.ico file convention.
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
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
    <html lang="en" className={`${sora.variable} ${manrope.variable} dark h-full`}>
      <body className="min-h-full">
        <Providers>{children}</Providers>
        <ServiceWorker />
      </body>
    </html>
  );
}
