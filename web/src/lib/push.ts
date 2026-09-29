import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import webpush from "web-push";
import { db } from "@/db";
import { profiles, pushSubscriptions, userApprovals } from "@/db/schema";
import { otherFriendIds } from "@/lib/friends/service";
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
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:admin@90x.app",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  configured = true;
}

/** Sends to every device of one user; drops subscriptions the push service says are gone. */
export async function sendToUser(userId: string, payload: Payload): Promise<number> {
  if (!pushEnabled()) return 0;
  configure();
  const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  let sent = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256Dh, auth: s.auth } }, JSON.stringify(payload), {
        TTL: 3600,
      });
      sent++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id));
      else console.error("push failed", status);
    }
  }
  return sent;
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
