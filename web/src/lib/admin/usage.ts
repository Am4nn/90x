import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";

// Who used the most today (UTC): a scraper shows up as a very high answer count, a person
// leaning on the Coach as a high AI spend. Admin only; the caller checks the viewer.

export type HeaviestRow = { email: string; answers: number; calls: number; usd: number };

const TODAY = sql`date_trunc('day', now() at time zone 'utc') at time zone 'utc'`;

export async function heaviestToday(limit = 5): Promise<{ byAnswers: HeaviestRow[]; bySpend: HeaviestRow[] }> {
  const rows = (await db.execute(sql`
    with a as (
      select user_id, count(*)::int as answers from public.card_reviews where created_at >= ${TODAY} group by user_id
    ), s as (
      select user_id, count(*)::int as calls, sum(cost_usd)::float as usd
      from public.ai_usage where user_id is not null and created_at >= ${TODAY} group by user_id
    )
    select u.email, coalesce(a.answers, 0) as answers, coalesce(s.calls, 0) as calls, coalesce(s.usd, 0) as usd
    from a full join s on s.user_id = a.user_id
    join auth.users u on u.id = coalesce(a.user_id, s.user_id)`)) as unknown as HeaviestRow[];
  const clean = rows.map((r) => ({ email: r.email, answers: Number(r.answers), calls: Number(r.calls), usd: Number(r.usd) }));
  return {
    byAnswers: clean
      .filter((r) => r.answers > 0)
      .toSorted((x, y) => y.answers - x.answers)
      .slice(0, limit),
    bySpend: clean
      .filter((r) => r.usd > 0)
      .toSorted((x, y) => y.usd - x.usd)
      .slice(0, limit),
  };
}
