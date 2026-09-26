import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "./providers";

// Self-hosted (scripts/fetch-fonts.ts) so the build never depends on Google Fonts.
const sora = localFont({ src: "./fonts/sora-latin.woff2", variable: "--font-sora", weight: "600 700", display: "swap" });
const manrope = localFont({ src: "./fonts/manrope-latin.woff2", variable: "--font-manrope", weight: "500 700", display: "swap" });

export const metadata: Metadata = {
  title: { default: "90x", template: "%s · 90x" },
  description: "Train. Measure. Adapt.",
  applicationName: "90x",
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
      </body>
    </html>
  );
}
