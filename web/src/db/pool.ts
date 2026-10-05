// How many connections one server instance may hold, and for how long.
//
// On Vercel every concurrent burst can start new instances, and each one has its own pool.
// They all connect to Supavisor (transaction mode, port 6543), which caps client connections
// per project and multiplexes them onto a small pool of real Postgres backends. postgres.js
// defaults to 10 per instance, so 30 instances would ask for 300 clients. A small `max` keeps
// instances x max under the pooler's client limit; a page's parallel queries beyond it wait in
// postgres.js (not on a busy connection: max_pipeline is 0) for one of these to come free.
//
// - max: DB_POOL_MAX, default 5. The busiest page (Me) starts about a dozen queries at
//   once, and they are sub-millisecond each, so 5 is enough for one instance.
// - idle_timeout: 20 s. A warm instance keeps its connections between requests, and a frozen
//   or recycled one gives them back to the pooler instead of holding them until Supavisor
//   times them out.
// - connect_timeout: 10 s. A connection that cannot be opened fails the request instead of
//   hanging it until the platform's own function timeout (the postgres.js default is 30 s).

export const DEFAULT_POOL_MAX = 5;

export function poolOptions(env: { DB_POOL_MAX?: string }): { max: number; idle_timeout: number; connect_timeout: number } {
  const wanted = Number(env.DB_POOL_MAX);
  const max = Number.isInteger(wanted) && wanted > 0 ? wanted : DEFAULT_POOL_MAX;
  return { max, idle_timeout: 20, connect_timeout: 10 };
}
