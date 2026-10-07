import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-url";

// The front door, the try page and the two public legal pages.
export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", "/try", "/privacy", "/terms"].map((path) => ({
    url: new URL(path, siteUrl()).href,
  }));
}
