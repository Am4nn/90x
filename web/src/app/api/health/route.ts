import { sql } from "drizzle-orm";
import { db } from "@/db";
import { maintenanceOn } from "@/lib/maintenance/flag";
import { deployVersion, healthResponse, passes } from "@/lib/monitoring/health";
import { redis } from "@/lib/upstash/redis";

// Never cached: a monitor must see the state now.
export const dynamic = "force-dynamic";

// UptimeRobot polls this. No auth and no user data: it only says whether the
// database and Redis answer, whether maintenance mode is on, and which deploy (commit, branch, region) answered.
// It answers under the break-glass too. The proxy skips this path, so there is no Supabase Auth call.
export async function GET() {
  const [database, redisUp, maintenance] = await Promise.all([
    passes(() => db.execute(sql`select 1`), 3000),
    passes(() => redis().ping(), 3000),
    maintenanceOn(),
  ]);
  const { status, body } = healthResponse({ database, redis: redisUp }, deployVersion(), maintenance);
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
