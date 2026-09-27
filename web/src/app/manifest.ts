import type { MetadataRoute } from "next";

// Colours are the --x-bg token in globals.css; icons come from scripts/make-icons.ts.
const BACKGROUND = "#0a0c10";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "90x",
    short_name: "90x",
    description: "Train. Measure. Adapt. Daily interview-prep missions, a question feed and a coach.",
    start_url: "/today",
    scope: "/",
    display: "standalone",
    background_color: BACKGROUND,
    theme_color: BACKGROUND,
    categories: ["education", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
