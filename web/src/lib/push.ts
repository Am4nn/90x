import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import webpush from "web-push";
import { z } from "zod";
import { db } from "@/db";
import { profiles, pushSubscriptions, userApprovals } from "@/db/schema";
import { otherFriendIds } from "@/lib/friends/service";
import { classifyStatus, endpointHost, type SendResult, shortDetail, vapidSubject } from "@/lib/push-rules";
import { key } from "@/lib/upstash/keys";
import { redis } from "@/lib/upstash/redis";

// Web push. Every send is to one user's own devices.

export type Payload = { title: string; body: string; url?: string; tag?: string };
export type PushSettings = { evening: boolean; friends: boolean; weekly: boolean };

const DEFAULT_SETTINGS: PushSettings = { evening: true, friends: false, weekly: true };

let configured = false;
export function pushEnabled() {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

function configure() {
  if (configured) return;
  const { subject, valid } = vapidSubject(process.env.VAPID_SUBJECT, process.env.NEXT_PUBLIC_APP_URL);
  if (!valid)
    console.warn(JSON.stringify({ evt: "push.config", problem: "VAPID_SUBJECT is not a mailto: address or https URL; using a fallback" }));
  // Trimmed: a pasted key with a trailing newline makes the signature invalid.
  webpush.setVapidDetails(subject, process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!.trim(), process.env.VAPID_PRIVATE_KEY!.trim());
  configured = true;
}

export type SendReport = { sent: number; results: SendResult[] };
export type SendOptions = { ttl?: number; urgency?: "very-low" | "low" | "normal" | "high" };

/**
 * Sends to every device of one user. Each outcome is logged as one JSON line and saved on the
 * subscription row; subscriptions the push service says are gone are deleted.
 */
export async function sendToUser(userId: string, payload: Payload, options: SendOptions = {}): Promise<SendReport> {
  if (!pushEnabled()) {
    console.warn(JSON.stringify({ evt: "push.skip", reason: "VAPID keys not set", tag: payload.tag ?? null }));
    return { sent: 0, results: [] };
  }
  configure();
  const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  if (!subs.length) console.log(JSON.stringify({ evt: "push.skip", reason: "no subscriptions", tag: payload.tag ?? null }));
  const results: SendResult[] = [];
  for (const s of subs) {
    const host = endpointHost(s.endpoint);
    let status: number | null = null;
    let detail: string | null = null;
    try {
      const res = await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256Dh, auth: s.auth } },
        JSON.stringify(payload),
        {
          TTL: options.ttl ?? 3600,
          urgency: options.urgency ?? "normal",
        },
      );
      status = res.statusCode;
    } catch (e) {
      const err = e as { statusCode?: number; body?: unknown; message?: string };
      status = err.statusCode ?? null;
      detail = shortDetail(err.body) ?? shortDetail(err.message);
    }
    const kind = classifyStatus(status ?? undefined);
    const result: SendResult = { host, status, kind, detail };
    results.push(result);
    console.log(JSON.stringify({ evt: "push.send", tag: payload.tag ?? null, ...result }));
    await recordOutcome(s.id, result);
  }
  return { sent: results.filter((r) => r.kind === "ok").length, results };
}

async function recordOutcome(id: string, r: SendResult) {
  try {
    if (r.kind === "gone") {
      await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, id));
    } else if (r.kind === "ok") {
      await db
        .update(pushSubscriptions)
        .set({ lastOkAt: new Date().toISOString(), lastStatus: r.status, lastError: null, failCount: 0 })
        .where(eq(pushSubscriptions.id, id));
    } else {
      await db
        .update(pushSubscriptions)
        .set({
          lastErrorAt: new Date().toISOString(),
          lastStatus: r.status,
          lastError: r.detail,
          failCount: sql`${pushSubscriptions.failCount} + 1`,
        })
        .where(eq(pushSubscriptions.id, id));
    }
  } catch (e) {
    console.error(JSON.stringify({ evt: "push.record_failed", message: (e as Error).message }));
  }
}

const SubscriptionShape = z.object({
  endpoint: z.url().max(1000),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});

/** Saves a browser's subscription for a user; false when the browser sent something unusable. */
export async function saveSubscription(userId: string, raw: unknown): Promise<boolean> {
  const parsed = SubscriptionShape.safeParse(raw);
  if (!parsed.success) return false;
  const { endpoint, keys } = parsed.data;
  // An endpoint belongs to one browser; if someone else signed in on it before, it moves to you.
  // A fresh save also clears the failure streak: a re-subscribed device gets a clean start.
  await db
    .insert(pushSubscriptions)
    .values({ userId, endpoint, p256Dh: keys.p256dh, auth: keys.auth })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { userId, p256Dh: keys.p256dh, auth: keys.auth, failCount: 0, lastError: null },
    });
  return true;
}

export function settingsOf(raw: unknown): PushSettings {
  const n = (raw ?? {}) as Partial<PushSettings>;
  return {
    evening: n.evening ?? DEFAULT_SETTINGS.evening,
    friends: n.friends ?? DEFAULT_SETTINGS.friends,
    weekly: n.weekly ?? DEFAULT_SETTINGS.weekly,
  };
}

const FRIEND_PUSH_COOLDOWN_SECONDS = 3 * 60 * 60;

/** Tell friends who opted in that someone checked in; at most once per 3 h per pair. */
export async function notifyFriends(userId: string, name: string, title: string, url: string) {
  if (!pushEnabled()) return;
  // Only actual friends, not every approved user.
  const otherIds = await otherFriendIds(userId);
  if (!otherIds.length) return;
  const friends = await db
    .select({ userId: profiles.userId, notifications: profiles.notifications })
    .from(profiles)
    .innerJoin(userApprovals, and(eq(userApprovals.userId, profiles.userId), eq(userApprovals.status, "approved")))
    .innerJoin(pushSubscriptions, eq(pushSubscriptions.userId, profiles.userId))
    .where(and(inArray(profiles.userId, otherIds), sql`coalesce((${profiles.notifications} ->> 'friends')::boolean, false)`))
    .groupBy(profiles.userId, profiles.notifications);
  for (const f of friends) {
    const fresh = await redis().set(key("push", "friend", f.userId, userId), "1", { nx: true, ex: FRIEND_PUSH_COOLDOWN_SECONDS });
    if (fresh) await sendToUser(f.userId, { title: `${name} checked in`, body: title, url, tag: `friend-${userId}` });
  }
}
