// Where a visitor came from, kept in a short first-party cookie until they sign up.
// Pure on purpose: the proxy (edge) and the sign-in callback both use it, and so do the tests.

export const SOURCE_COOKIE = "x90_src";
export const SOURCE_COOKIE_DAYS = 30;

export type Attribution = { source: string; medium: string | null; campaign: string | null; referrer: string | null };
export type SourceGroup = "linkedin" | "share" | "other" | "direct" | "unknown";

const clip = (v: string | null | undefined) => {
  const t = (v ?? "").trim().toLowerCase().slice(0, 100);
  return t || null;
};

// Hosts that are part of signing in, not a place the visitor came from.
const AUTH_HOSTS = [/(^|\.)google\.com$/, /(^|\.)supabase\.co$/];

/** The attribution for one request, or null when there is nothing worth keeping (or one is already stored).
 *  `host` is this site's own host, so a click from our own pages is never a "referrer". */
export function captureSource(input: { url: URL; referer: string | null; host: string; hasCookie: boolean }): Attribution | null {
  if (input.hasCookie) return null;
  const q = input.url.searchParams;
  let referrer: string | null = null;
  if (input.referer) {
    try {
      const h = new URL(input.referer).hostname.toLowerCase();
      if (h && h !== input.host.split(":")[0] && !AUTH_HOSTS.some((re) => re.test(h))) referrer = h.slice(0, 100);
    } catch {
      // A Referer that is not a URL (some apps send android-app://...) is read as-is below.
      const raw = input.referer.toLowerCase();
      if (raw.includes("linkedin")) referrer = "linkedin.android";
    }
  }
  const utm = clip(q.get("utm_source"));
  if (!utm && !referrer) return null;
  return { source: utm ?? referrer!, medium: clip(q.get("utm_medium")), campaign: clip(q.get("utm_campaign")), referrer };
}

export function encodeAttribution(a: Attribution): string {
  return JSON.stringify(a);
}

/** Reads the cookie value back; anything malformed is treated as no cookie. */
export function decodeAttribution(raw: string | undefined | null): Attribution | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<Attribution>;
    const source = clip(typeof v.source === "string" ? v.source : null);
    if (!source) return null;
    const s = (x: unknown) => clip(typeof x === "string" ? x : null);
    return { source, medium: s(v.medium), campaign: s(v.campaign), referrer: s(v.referrer) };
  } catch {
    return null;
  }
}

/** The five buckets the Analytics page shows. 'direct' is stored for a sign-up that arrived with no cookie;
 *  null is a profile from before capture existed. */
export function sourceGroup(source: string | null | undefined, referrer?: string | null): SourceGroup {
  if (!source) return "unknown";
  if (source === "direct") return "direct";
  // Before the LinkedIn test: a share link opened from a LinkedIn post carries a LinkedIn referrer.
  if (source === "share") return "share";
  const hay = `${source} ${referrer ?? ""}`.toLowerCase();
  if (hay.includes("linkedin") || /(^|[\s.])lnkd\.in($|\s)/.test(hay)) return "linkedin";
  return "other";
}
