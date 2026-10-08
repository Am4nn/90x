import { sql } from "drizzle-orm";
import { db } from "@/db";
import { maintenanceOn } from "@/lib/maintenance/flag";
import { deployVersion, HEALTH_CACHE_MS, healthResponse, passes, sharedFor } from "@/lib/monitoring/health";
import { redis } from "@/lib/upstash/redis";

// Never cached by the CDN: a monitor must see the state now (at most HEALTH_CACHE_MS old, see below).
export const dynamic = "force-dynamic";

// The database query and Redis PING run at most once per 15 seconds per instance, and a burst shares one
// check: this route has no auth, so a flood of GETs must not turn into a flood of queries and Redis commands.
const dependencies = sharedFor(HEALTH_CACHE_MS, async () => {
  const [database, redisUp] = await Promise.all([passes(() => db.execute(sql`select 1`), 3000), passes(() => redis().ping(), 3000)]);
  return { database, redis: redisUp };
});

// UptimeRobot polls this. No auth and no user data: it only says whether the
// database and Redis answer, whether maintenance mode is on, and which deploy (commit, branch, region) answered.
// It answers under the break-glass too. The proxy skips this path, so there is no Supabase Auth call.
export async function GET() {
  // maintenanceOn() reads this instance's in-memory flag, so it is asked every time.
  const [checks, maintenance] = await Promise.all([dependencies(), maintenanceOn()]);
  const { status, body } = healthResponse(checks, deployVersion(), maintenance);
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
