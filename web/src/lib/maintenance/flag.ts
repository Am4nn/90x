import { Redis } from "@upstash/redis";
// Is maintenance on? Asked by the proxy on every request, by the layouts that show the admin banner,
// and by the background senders (jobs, push, email, AI). The admin switch is stored in app_settings and
// mirrored to Redis on save; this reads the Redis copy through an in-memory stale-while-revalidate cache
// (flag-cache.ts), so a warm instance never waits on the network. A Redis error keeps the last known value;
// only a cold instance with nothing known reads live. The break-glass env var wins over both.
//
// No "server-only" import: the proxy bundle imports this too, and it only ever runs on the server.
import { logError, safeError } from "@/lib/log";
import { key } from "@/lib/upstash/keys";
import { swrValue } from "./flag-cache";
import { breakGlass, LIVE, type MaintenanceState, parseState } from "./rules";

const KEY = key("maintenance");
/** How stale a server instance's answer can be after an admin flips the switch (off: at most this; on: this plus one request). */
const TTL_MS = 10_000;
/** A cold instance waits this long at most for Redis before treating the app as live. */
const TIMEOUT_MS = 1_500;
/** An instance idle longer than this waits for a fresh read instead of serving its old "live" once. */
const MAX_STALE_MS = 60_000;

// Its own client: no retries, so a broken Redis fails fast (to the last known value) instead of backing off on a request.
let client: Redis | null = null;
const redis = () =>
  (client ??= new Redis({ url: process.env.UPSTASH_REDIS_REST_URL!, token: process.env.UPSTASH_REDIS_REST_TOKEN!, retry: false }));

const flag = swrValue<MaintenanceState>({
  load: async () => parseState(await redis().get(KEY)),
  fallback: LIVE,
  ttlMs: TTL_MS,
  timeoutMs: TIMEOUT_MS,
  onError: (e) => console.error(JSON.stringify({ evt: "maintenance.flag.unreadable", error: safeError(e) })),
  // "Live" is served stale (everyday requests never wait), "on" is not: once the TTL is past, a request waits for
  // the fresh value, so turning the switch off reaches every instance within the TTL, even one that sat idle.
  // While the app is down that wait costs nothing anyone notices.
  awaitWhenStale: (state) => state.on,
  // An instance that sat idle (no request refreshed it for a minute) waits for the fresh value too, so an
  // hour-old "live" never lets one request through after the switch went on. A busy instance refreshes every
  // TTL in the background and never reaches this age, so everyday requests still never wait.
  maxStaleMs: MAX_STALE_MS,
});

/** The admin switch as this instance last saw it. Ignores the break-glass; see {@link maintenanceOn}. */
export function maintenanceState(): Promise<MaintenanceState> {
  return flag.get();
}

/** The background refresh in flight, for the proxy to hand to waitUntil. */
export function maintenanceRefresh(): Promise<unknown> | null {
  return flag.pending();
}

/** True when the app is down for non-admins, by the switch or the break-glass. */
export async function maintenanceOn(): Promise<boolean> {
  return breakGlass() || (await flag.get()).on;
}

/** For background work (jobs, push, email): true, with one log line saying so, when it should not run because the app is down. */
export async function skippedForMaintenance(what: string, detail: Record<string, unknown> = {}): Promise<boolean> {
  if (!(await maintenanceOn())) return false;
  console.log(JSON.stringify({ evt: `${what}.skip`, reason: "maintenance", ...detail }));
  return true;
}

/** What the proxy obeys right now, read straight from Redis (no cache), or null when Redis cannot be read. For the admin page. */
export async function readPublishedMaintenance(): Promise<MaintenanceState | null> {
  try {
    return parseState(await redis().get(KEY));
  } catch (e) {
    logError("maintenance state unreadable", e);
    return null;
  }
}

/** Called by the settings save: writes the Redis copy every instance reads, and this instance's memory at once. */
export async function publishMaintenance(state: MaintenanceState): Promise<void> {
  await redis().set(KEY, state);
  flag.set(state);
}
