import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Server-only. Bypasses RLS, so every query must scope by user itself.
// Supabase's transaction pooler (Supavisor) needs both options:
// - prepare: false, since a statement prepared on one backend isn't there on the next.
// - max_pipeline: 0. When more queries run at once than there are connections
//   (Coach's parallel tools, Today), postgres.js queues extra queries on busy
//   connections. Supavisor drops the reply to such a queued query, so it waits
//   forever. sql.begin() at 0 needs patches/postgres@3.4.9.patch (porsager/postgres#1210).
const client = postgres(process.env.DATABASE_URL!, { prepare: false, max_pipeline: 0 });

export const db = drizzle(client, { schema });
