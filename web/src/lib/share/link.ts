import { isShareCode } from "./code";

// The invite link reuses the signup-source capture: proxy.ts keeps utm_source/medium/campaign
// in a cookie and the sign-in callback copies them to profiles.signup_*. The sharer's code
// is the campaign, so the admin can group by sharer later without a new column.

/** The landing page, tagged so the sign-up is grouped under "Invite links". */
export function inviteUrl(origin: string, code: string): string {
  if (!isShareCode(code)) throw new Error("not a share code");
  const url = new URL("/", origin);
  url.searchParams.set("utm_source", "share");
  url.searchParams.set("utm_medium", "invite");
  url.searchParams.set("utm_campaign", code);
  return url.toString();
}

/** cardPath's cache-busting version, "<dayNumber>-<finishedDays>". Short on purpose; the route 404s anything else. */
export const VERSION = /^\d{1,3}-\d{1,3}$/;

/** The share card PNG. `version` ("<dayNumber>-<finishedDays>") changes when the sharer's progress does, so a cached card never goes stale for them. */
export function cardPath(code: string, version?: string): string {
  const base = `/api/share/${code}`;
  if (version === undefined) return base;
  // The route 404s any other shape, so refuse it here rather than ship a dead image URL.
  if (!VERSION.test(version)) throw new Error("not a card version");
  return `${base}?v=${version}`;
}

type Sharer = { share?: unknown; canShare?: (data: ShareData) => boolean };

/** What the device can do: share the PNG itself, share only the link, or neither (copy and download instead). */
export function shareMode(nav: Sharer, file: File | null): "files" | "link" | "none" {
  if (typeof nav.share !== "function") return "none";
  if (file && typeof nav.canShare === "function" && nav.canShare({ files: [file] })) return "files";
  return "link";
}
