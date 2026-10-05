import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-url";

// The front door and the three public legal pages.
export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", "/privacy", "/terms", "/delete-account"].map((path) => ({ url: new URL(path, siteUrl()).href }));
}
