# Load test: pre-LinkedIn-launch, local only

Local production build (`next start`, port 3100) on the local Supabase Docker DB, SRH Redis shim and
fake AI model. Nothing production was touched. Tooling: `web/scripts/load/` (see its README).
Raw numbers: `web/scripts/load/results-full-run.json`.

## Method and caveats

- Closed-loop virtual users, 10 s ramp, 60 s per level, 25 / 50 / 100 VUs. Signed-in scenarios reuse 100
  users signed in through the e2e test route. The Feed scenarios use fresh users per level (the Feed
  allows 300 actions per user per hour).
- Feed loop = `GET /feed`, then `getNextCard` and 3 x `submitAnswer(preload)` server-action POSTs with 0.3-1 s
  think time. Answers are shaped per card primitive (compose answers go to the fake model).
- Generator, one Node server process, Docker Postgres/Auth/PostgREST and Redis all share one Windows
  machine. Absolute numbers are not production numbers. What transfers: per-request cost, the shape
  of the curve, and the per-request calls the app makes.

## Headline numbers

Zero errors and zero 429s in every scenario (about 28k requests). The failure mode is latency, not errors.

| Scenario | VUs | Req | rps | p50 ms | p95 ms | p99 ms |
|---|---|---|---|---|---|---|
| Landing `/` (static, signed out) | 25 | 4307 | 72 | 260 | 780 | 939 |
| | 50 | 5973 | 99 | 356 | 1094 | 1925 |
| | 100 | 10192 | 169 | 517 | 1168 | 1427 |
| `/today` | 25 | 481 | 7.9 | 2771 | 5054 | 6458 |
| | 50 | 393 | 6.3 | 5521 | 15489 | 15854 |
| | 100 | 569 | 8.9 | 10959 | 11992 | 12284 |
| `/feed` | 25 | 685 | 11.3 | 2077 | 2638 | 3499 |
| | 50 | 754 | 12.4 | 3910 | 4975 | 5143 |
| | 100 | 524 | 8.4 | 9557 | 16761 | 17166 |
| `/library` | 25 | 504 | 8.3 | 2781 | 5513 | 6195 |
| | 50 | 618 | 10.2 | 4004 | 7580 | 8082 |
| | 100 | 864 | 14.1 | 6655 | 7941 | 8178 |
| `/me` | 25 | 436 | 7.2 | 3182 | 4953 | 5379 |
| | 50 | 539 | 8.8 | 4338 | 14159 | 16825 |
| | 100 | 569 | 9.2 | 8598 | 20430 | 20655 |
| `/coach` | 25 | 1026 | 16.8 | 1207 | 2980 | 4330 |
| | 50 | 1378 | 22.9 | 1969 | 3246 | 3496 |
| | 100 | 1399 | 22.8 | 4326 | 5893 | 6357 |
| `/today` first open of the day (planning write), all at once | 25 | 25 | | 2372 | 2413 | 2413 |
| | 50 | 50 | | 4204 | 4242 | 4242 |
| | 100 | 100 | | 8957 | 9032 | 9033 |
| Feed loop (GET /feed + actions) | 25 | 880 | 13.4 | 1170 | 2414 | 2826 |
| | 50 | 1045 | 15.6 | 2470 | 4189 | 5404 |
| | 100 | 1070 | 15.1 | 6159 | 8673 | 9720 |
| Mixed (40% landing, 20% today, 20% library, 20% feed loop) | 25 | 1287 | 20.0 | 831 | 1960 | 2348 |
| | 50 | 1359 | 21.0 | 1414 | 4043 | 4287 |
| | 100 | 1427 | 20.2 | 3160 | 8495 | 9110 |

Uncontended (1 user, sequential, `probe.ts`): `/` 7 ms; `/today` 121; `/feed` 95; `/library` 92;
`/me` 105; `/coach` 97 ms. One Feed action (1 VU loop) about 150 ms. One cold `/today` 238 ms.

Postgres client connections peaked at 45 (baseline about 34 with the other local servers idle), so the
app added at most about 10-11: the pool, not the database, is capped. No rate-limit 429 in any scenario.

## What the numbers say

1. **A single Node process saturates at about 8-23 requests/second for signed-in pages, regardless of
   VUs.** Throughput is flat from 25 to 100 VUs and latency grows linearly with VUs (Little's law:
   queueing). While the pages ran, the server process sat at about 100-115% of one core on a 16-core
   box, while the DB was idle (queries are sub-millisecond; see below). Static landing handles about 170 rps on the same box,
   so the framework itself is not the limit: per-request signed-in work is.
2. Service time is about 100-170 ms for a signed-in page even with nobody else around, which is why
   throughput tops out near 1 / 0.1 s per core.
3. Locally, the Supabase API calls the app makes on every signed-in request measure 65-75 ms each
   (`probe-auth.ts`: Auth `getUser` 65 ms, PostgREST `user_approvals` 74 ms, on a quiet box).

## Bottlenecks (ranked, with evidence)

1. **Every signed-in request pays for a full session check over HTTP before any page work.**
   `getViewer` (`web/src/lib/auth/viewer.ts`, called by `(app)/layout.tsx` and again by pages via
   `requireViewer`, deduplicated per request by `cache`) does `supabase.auth.getUser()` (a network
   call to Supabase Auth), then a PostgREST `user_approvals` read in parallel with a `profiles` read over
   Postgres. That is two HTTP calls to Supabase's API plus one SQL query on every page, every Feed
   action, and every prefetch, before the page's own queries. Locally these are 65-75 ms each, which is
   most of the 95-120 ms per-page service time; in production they add the Vercel (bom1) to Supabase
   region round trip on top. It also puts load on Supabase Auth and PostgREST, which have their own
   rate limits, not just the DB.
2. **`/today` runs a write transaction on every open, not just the first.** `ensureToday`
   (`web/src/lib/tracker/service.ts` ~L323-349) always opens `q.transaction` and runs
   `insert into days ... on conflict do nothing`; only when a row was claimed does it plan. So each
   page view is BEGIN + INSERT-attempt + COMMIT, and serial awaits follow: `context` then
   `closePastDays` (2-3 queries) then the transaction then `todayView` (3 parallel queries) then
   XP, weekly and friend-request queries. Slowest page (121 ms uncontended, p50 2.8-11 s under load)
   and the only one that writes on read. First open of the day for 100 users at once took 9 s p50.
3. **`/me` and `/library` have the worst tails** (p99 20.7 s and 8.2 s at 100 VUs; p95 14-20 s at 50-100
   VUs for `/me`). Both fan out many `checkins` and `xp_events` queries (`web/src/lib/tracker/me.ts`,
   `web/src/lib/library/queries.ts`, 4+ `from(checkins)` each). Cheap on an 11-row table; the planner
   uses seq scans today (pg_stat_user_tables: `checkins` 23.6k seq scans, `xp_events` 5.2k), and
   indexes exist for the real access paths (`checkins_user_idx (user_id, created_at desc)`,
   `xp_events_user_day_idx`), so this scales with per-user history, not with traffic. Watch it after
   launch week as users accumulate check-ins.
4. **One Node process is CPU-bound and the response is not cached.** All signed-in pages are
   `dynamic` (per-user), so nothing is shared between users. On Vercel each concurrent request can
   land on a new instance and this becomes cost and cold-start concurrency, not a throughput wall, but
   it also means a spike multiplies the number of instances, each with its own DB pool (item 5).
5. **Connection arithmetic against the Supabase pooler.** `web/src/db/index.ts` uses `postgres(DATABASE_URL, {prepare:false, max_pipeline:0})`
   with no `max`, so the postgres.js default of 10 connections per instance applies. Locally the app
   added about 10 connections. Behind Supavisor (transaction mode) the free/Nano plan commonly has a
   default pool of about 15 server connections and a client-connection limit in the low hundreds (confirm
   in the Supabase dashboard: Database > Settings > Connection pooling). A spike that fans out to, say,
   20-30 concurrent Vercel instances x 10 = 200-300 client connections can hit the client limit or
   exhaust the 15-wide pool, and with `max_pipeline: 0` a query waiting for a free backend queues at
   the pooler. Locally `DATABASE_URL` goes straight to Postgres on 64322, so the pooler path was not
   exercised: **this is the largest production risk this test could not measure.**

Not a bottleneck: **database indexes.** `EXPLAIN ANALYZE` on the hottest `/today` queries (`days` pending
lookup, missions join, days by user) is 0.02-0.12 ms using `days_pkey` and `missions_user_date_idx`;
`card_state`, `card_reviews`, `xp_events`, `checkins`, `readiness_snapshots`, `friendships` all have
(user_id, ...) indexes. No migration was added and nothing was applied to any database.

Also checked: the Feed rate limit (`FEED_LIMIT` 300 actions/user/hour, Redis INCR, fails open) never
fired in these runs (0 `TOO_FAST` errors), and the Redis shim was not a bottleneck. AI-graded compose
answers were exercised only against the fake model; real model latency and cost are not covered.

## Recommended fixes, ranked by impact / effort

1. **Make `ensureToday` read first, write only if missing** (small, high impact on `/today`). `select` the
   day row; only open the transaction (claim + plan) when absent. Removes a write and 3 round trips from
   every repeat open. Not implemented (it is in `lib/tracker`).
2. **Cut the per-request session cost** (medium effort, biggest win for every page). Verify the JWT
   locally (`supabase.auth.getClaims()` with the project's JWKS, no Auth round trip) instead of
   `getUser()`, and read approval status in the same Postgres query as the profile (or put it in the JWT
   as a claim) instead of a PostgREST call. Turns 2 HTTP calls into 0 and 1 SQL query.
3. **Confirm and fix the connection path before launch** (small effort, protects against an outage).
   Set `DATABASE_URL` to the Supavisor transaction pooler (port 6543), set an explicit small `max`
   (e.g. 3-5) in `web/src/db/index.ts` so N instances x max stays under the pooler client limit,
   and check the project's compute size (a larger compute raises the pool size). Re-run this load test
   with the pooler URL, ideally from a staging project, to see queueing.
4. **Run the fan-out on `/me` and `/library` in parallel and trim it** (medium). Consolidate the repeated
   `checkins` and `xp_events` reads into one or two queries per page, or stream the heavy sections
   behind `Suspense` as `/today` already does for XP and stats, so the shell paints first.
5. **Cache what is shared** (small): the landing page is already static and fast (170 rps on one
   process); keep it static and make sure no signed-out marketing page reads cookies. For the Feed, the
   card catalogue lookups are identical across users and can be `unstable_cache`d briefly.
6. **Stagger the first-open-of-the-day planning**: it is a burst because every user's first `/today`
   plans the day. If launch day brings thousands of new users at once, plan at sign-up/setup instead
   (the work is the same, but it moves off the first screen).
7. Before launch, do a real check on Vercel preview against a staging Supabase project with this
   same script (`LOAD_BASE=...`), since local numbers cannot show cross-region latency or pooler limits.
   The test sign-in route is disabled there by design, so that run needs a sign-in shim for staging only.

## Not covered

Real AI latency, the Supavisor pooler, Vercel instance fan-out and cold starts, cross-region latency
(Vercel `bom1` vs the Supabase region), Supabase Auth/PostgREST rate limits, Google OAuth sign-in.
