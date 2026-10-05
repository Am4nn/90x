import { sql } from "drizzle-orm";
import { db } from "@/db";
import { deployVersion, healthResponse, passes } from "@/lib/monitoring/health";
import { redis } from "@/lib/upstash/redis";

// Never cached: a monitor must see the state now.
export const dynamic = "force-dynamic";

// UptimeRobot polls this. No auth and no user data: it only says whether the
// database and Redis answer, and which deploy (commit, branch, region) answered. The proxy skips this path, so there is no Supabase Auth call.
export async function GET() {
  const [database, redisUp] = await Promise.all([passes(() => db.execute(sql`select 1`), 3000), passes(() => redis().ping(), 3000)]);
  const { status, body } = healthResponse({ database, redis: redisUp }, deployVersion());
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
