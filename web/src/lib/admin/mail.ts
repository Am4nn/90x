import "server-only";
import { logError } from "@/lib/log";
import { key } from "@/lib/upstash/keys";
import { redis } from "@/lib/upstash/redis";
import { newestFirst } from "./mail-time";

// Mail sent TO the app, read straight from Resend.
//
// `mail.90x.amanarya.com` has receiving enabled, so replies to an invite and
// anything else addressed to it land in Resend rather than a mailbox. Nothing
// consumed them: they arrived and sat there. This is the admin's view of them.
//
// Read live rather than mirrored into our own table. Resend already stores them
// with their bodies and authentication results, a second copy would need a
// webhook, a table and a backfill for anything received before it existed, and
// the only reader is one admin looking at a handful of messages. The cost is
// that this page is as available as Resend is, which for an admin screen is a
// trade worth making.
//
// Requests set a User-Agent. Resend sits behind Cloudflare, which answers a
// request with no UA with `403 error code: 1010` - a signature ban that reads
// exactly like a rejected credential and cost an hour of suspecting the key.

const API = "https://api.resend.com";
const UA = "90x/1.0 (+https://90x.amanarya.com)";

export type InboundEmail = {
  id: string;
  from: string;
  to: string[];
  subject: string;
  createdAt: string;
  attachments: number;
};

export type InboundDetail = InboundEmail & {
  html: string | null;
  text: string | null;
  /** SPF/DKIM/DMARC as Resend judged them, so a forged sender is visible. */
  authentication: Record<string, unknown> | null;
};

/** Null when Resend is unconfigured or unreachable, so callers can say which. */
async function fromResend<T>(path: string): Promise<T | null> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch(`${API}${path}`, {
      headers: { authorization: `Bearer ${apiKey}`, "user-agent": UA, accept: "application/json" },
      // Always fresh: an admin refreshing to see whether a reply arrived is the
      // whole use, and Next would otherwise cache this for the route's lifetime.
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error(`resend ${path} -> ${res.status}`, (await res.text()).slice(0, 200));
      return null;
    }
    return (await res.json()) as T;
  } catch (e) {
    logError(`resend ${path} failed`, e);
    return null;
  }
}

const asStrings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

function asEmail(row: Record<string, unknown>): InboundEmail {
  return {
    id: String(row.id ?? ""),
    from: typeof row.from === "string" ? row.from : "unknown sender",
    to: asStrings(row.to),
    subject: typeof row.subject === "string" && row.subject ? row.subject : "(no subject)",
    createdAt: typeof row.created_at === "string" ? row.created_at : "",
    attachments: Array.isArray(row.attachments) ? row.attachments.length : 0,
  };
}

/** Everything received, newest first. Null means Resend could not be read. */
export async function inboundEmails(): Promise<InboundEmail[] | null> {
  const body = await fromResend<{ data?: unknown }>("/emails/inbound");
  if (!body) return null;
  const rows = Array.isArray(body.data) ? body.data : [];
  return rows
    .filter((r): r is Record<string, unknown> => typeof r === "object" && r !== null)
    .map(asEmail)
    .toSorted(newestFirst);
}

export async function inboundEmail(id: string): Promise<InboundDetail | null> {
  const row = await fromResend<Record<string, unknown>>(`/emails/inbound/${encodeURIComponent(id)}`);
  if (!row) return null;
  return {
    ...asEmail(row),
    html: typeof row.html === "string" ? row.html : null,
    text: typeof row.text === "string" ? row.text : null,
    authentication:
      typeof row.authentication === "object" && row.authentication !== null ? (row.authentication as Record<string, unknown>) : null,
  };
}

// "Unread" is one timestamp per admin, not a row per message. The badge only
// ever needs "how many since you last looked", opening the list is what answers
// it, and a per-message read flag would be a table and a write path for a
// distinction nobody would use on an inbox this size.
const seenKey = (userId: string) => key("admin", "mail-seen", userId);

export async function lastSeenMailAt(userId: string): Promise<string | null> {
  try {
    const at = await redis().get<string>(seenKey(userId));
    return typeof at === "string" ? at : null;
  } catch (e) {
    // Redis down: everything reads as unread, which overstates rather than
    // hides. A badge that silently says zero is the worse failure.
    logError("mail seen marker unavailable", e);
    return null;
  }
}

export async function markMailSeen(userId: string): Promise<void> {
  try {
    await redis().set(seenKey(userId), new Date().toISOString());
  } catch (e) {
    logError("could not record that mail was seen", e);
  }
}
