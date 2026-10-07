import localFont from "next/font/local";

// JetBrains Mono, for the landing page and /try only (Ren's ASCII, the typed chat, the step
// numbers, the code blocks). Self-hosted by scripts/fetch-fonts.ts like Sora and Manrope. Its class
// goes on the landing and /try roots, not the document, so no other page pays for it.
export const jetbrains = localFont({
  src: "../../app/fonts/jetbrains-mono-latin.woff2",
  variable: "--font-jetbrains",
  weight: "500 700",
  display: "swap",
});

// Doto Black, the dot-matrix face the mock draws the Number card's big digit in.
export const doto = localFont({
  src: "../../app/fonts/doto-900-latin.woff2",
  variable: "--font-doto",
  weight: "900",
  display: "swap",
});
