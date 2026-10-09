import type { NextRequest } from "next/server";
import { logError } from "@/lib/log";
import { maintenanceOn } from "@/lib/maintenance/flag";
import { insertTryEvent, TryEventSchema } from "@/lib/try/events";
import { takeTryEventSlot } from "@/lib/upstash/rate-limit";

// The /try beacon: public, no session (proxy.ts passes it through), always 204 so a visitor's page never waits
// on it or sees an error. A body over 2 KB, a bad body, the maintenance switch on, an address over its allowance,
// the meter down (takeTryEventSlot fails closed) or a failed insert all drop the event quietly. The address is
// only hashed into a Redis key for the hour; it is never written to Redis or Postgres as is.

export const dynamic = "force-dynamic";

/** Far above any real event (about 150 bytes); anything bigger is not from the beacon. */
const MAX_BODY = 2048;

export async function POST(request: NextRequest): Promise<Response> {
  const ok = new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY) return ok;
  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY) return ok;
    body = JSON.parse(text);
  } catch {
    return ok;
  }
  const parsed = TryEventSchema.safeParse(body);
  if (!parsed.success) return ok;
  // The cached switch (the same read the proxy makes), free on a warm instance.
  if (await maintenanceOn()) return ok;
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!(await takeTryEventSlot(ip))) return ok;
  try {
    await insertTryEvent(parsed.data);
  } catch (e) {
    logError("try event: insert failed", e);
  }
  return ok;
}
