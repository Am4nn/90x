import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-url";

// Only the front door, the try page and the legal pages are worth indexing. This asks well-behaved
// crawlers to stay out of the rest; it is not access control, every page checks the viewer itself.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/try", "/privacy", "/terms"],
      disallow: [
        "/api/",
        "/auth/",
        "/today",
        "/feed",
        "/coach",
        "/library",
        "/me",
        "/friends",
        "/admin",
        "/setup",
        "/pending",
        "/offline",
        "/sign-in",
        "/delete-account",
      ],
    },
    sitemap: new URL("/sitemap.xml", siteUrl()).href,
  };
}
