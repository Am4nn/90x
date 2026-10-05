import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-url";

// Invite-only: only the front door is worth indexing. This asks well-behaved
// crawlers to stay out; it is not access control, every page checks the viewer itself.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/"],
      disallow: ["/api/", "/auth/", "/today", "/feed", "/coach", "/library", "/me", "/admin", "/setup", "/pending", "/offline"],
    },
    sitemap: new URL("/sitemap.xml", siteUrl()).href,
  };
}
