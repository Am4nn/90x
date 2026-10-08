// Pure rules for web push: what to make of a push service's answer, and which
// VAPID subject to sign with. Kept apart from push.ts so they can be unit-tested.

/** What a send ended as. `gone` subscriptions are deleted; `auth` means our VAPID setup is wrong. */
export type SendKind = "ok" | "gone" | "auth" | "retry" | "rejected" | "error";

export function classifyStatus(status: number | undefined): SendKind {
  if (status === undefined) return "error";
  if (status >= 200 && status < 300) return "ok";
  if (status === 404 || status === 410) return "gone";
  // 401/403: the push service did not accept our VAPID signature (wrong key pair or bad subject).
  if (status === 401 || status === 403) return "auth";
  if (status === 408 || status === 429 || status >= 500) return "retry";
  return "rejected";
}

export type SendResult = { host: string; status: number | null; kind: SendKind; detail: string | null };

/** Only the push service's host (web.push.apple.com, fcm.googleapis.com...). The rest of an endpoint is a secret. */
export function endpointHost(endpoint: string): string {
  try {
    return new URL(endpoint).host;
  } catch {
    return "invalid";
  }
}

/**
 * The push services browsers really hand out endpoints for: Chrome, Edge-on-Android, Opera, Samsung
 * (FCM), Firefox (Mozilla autopush), Safari (Apple), Edge on Windows (WNS), Samsung's own service.
 * The server POSTs to every saved endpoint on a schedule, so anything else would let a user aim our
 * signed requests at a host of their choosing.
 */
const PUSH_HOST =
  /^(?:fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|(?:[a-z0-9-]+\.)*push\.apple\.com|(?:[a-z0-9-]+\.)*notify\.windows\.com|(?:[a-z0-9-]+\.)*push\.samsung\.com)$/;

/** True for an https endpoint on a known push service, on the default port, with no credentials in it. */
export function isPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  return url.protocol === "https:" && url.port === "" && !url.username && !url.password && PUSH_HOST.test(url.hostname);
}

/** Devices one account may have subscribed at once; the oldest beyond it are dropped on a new save. */
export const MAX_PUSH_SUBSCRIPTIONS = 10;

/** The line shown to a person after a test push, per device. */
export function describeResult(r: SendResult): string {
  const who = r.host.includes("apple") ? "Apple" : r.host.includes("googleapis") || r.host.includes("google") ? "Google" : r.host;
  switch (r.kind) {
    case "ok":
      return `${who} accepted it. It should arrive in a few seconds.`;
    case "gone":
      return `${who} says this device is no longer subscribed. Turn notifications off and on again.`;
    case "auth":
      return `${who} refused our signature (${r.status}). The server's push keys or contact address are wrong.${r.detail ? ` ${r.detail}` : ""}`;
    case "retry":
      return `${who} is busy (${r.status}). Try again in a minute.`;
    case "rejected":
      return `${who} rejected it (${r.status}).${r.detail ? ` ${r.detail}` : ""}`;
    default:
      return `Couldn't reach ${who}.${r.detail ? ` ${r.detail}` : ""}`;
  }
}

/**
 * Apple (and Mozilla) check the VAPID `sub` claim: it must be https: or mailto: with a real address. An
 * empty `mailto:` (the .env.example placeholder) or a bare word is refused with 403. Falls back to the app URL.
 */
export function vapidSubject(raw: string | undefined, appUrl: string | undefined): { subject: string; valid: boolean } {
  const value = raw?.trim() ?? "";
  if (/^mailto:[^@\s]+@[^@\s]+\.[^@\s.]+$/i.test(value) || /^https:\/\/[^\s/]+\.[^\s/]+/i.test(value))
    return { subject: value, valid: true };
  const app = appUrl?.trim().replace(/\/$/, "");
  return { subject: app?.startsWith("https://") ? app : "mailto:admin@90x.amanarya.com", valid: false };
}

/** A push service's reason, cut down to something safe to store and show. */
export function shortDetail(body: unknown): string | null {
  if (typeof body !== "string") return null;
  const text = body.replace(/\s+/g, " ").trim();
  return text ? text.slice(0, 200) : null;
}
