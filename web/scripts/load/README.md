# Local load test

Closed-loop virtual users against a **local production build** and the **local Supabase only**.
Never point this at production: it signs users in through `/api/test/sign-in`, which answers 404
anywhere except an `E2E=1` + `ALLOW_TEST_SIGN_IN=1` local environment, and a per-IP firewall limit on `/api/` would block it anyway.

## Setup

1. Local stack up: Supabase (`supabase start`; default DB 54322, API 54321), the SRH Redis shim (8079, as in CI), and the fake AI model (from `web/`: `bun run e2e/fake-model.ts`, default port 8078).
2. Load your local env (local Supabase URL/keys, local `DATABASE_URL`, Redis, fake AI, `E2E=1`, `ALLOW_TEST_SIGN_IN=1`).
   Do not use a `web/.env.local` that holds production values.
3. Build and start on a free port (3000 may be a dev server):

   ```bash
   cd web
   bun install && rm -rf .next && bun run build
   bun run start -p 3100
   ```

## Run

```bash
cd web
bun scripts/load/run.ts all                               # everything, 25/50/100 VUs x 60 s
bun scripts/load/run.ts pages --vus 25 --seconds 30       # /today /feed /library /me /coach
bun scripts/load/run.ts feed --vus 10,25 --seconds 30     # server-action loop
bun scripts/load/probe.ts 20                              # uncontended per-page latency
bun scripts/load/probe-auth.ts                            # cost of a Supabase Auth call (needs the local env)
```

Scenarios: `landing`, `pages`, `today-cold` (first open of the day for fresh users, the planning write),
`feed` (GET /feed, then getNextCard + 3 submitAnswer server-action POSTs with 0.3-1 s reading time),
`mixed` (40% landing, 20% /today, 20% /library, 20% feed loop).
Options: `--vus 25,50,100`, `--seconds 60`, `--users 100`. `LOAD_BASE` overrides the base URL.

Server action ids are read from `.next/static` (`createServerReference("<id>", ..., "<name>")`), so run
against the build in this checkout. Each scenario that uses the Feed signs in fresh users, because the
Feed allows 300 actions/user/hour (`FEED_LIMIT`) and reusing users would measure the limiter.

Each run prints one line per scenario (requests, error %, 429 count, rps, p50/p95/p99/max, status
histogram, max Postgres client connections seen by `docker exec supabase_db_90X psql ...`) and writes
`results-<timestamp>.json` here. `results-full-run.json` is the run quoted in [LOAD-TEST.md](../../../LOAD-TEST.md) (taken before the speed fixes).

A response counts as an error when it is not 2xx, or (server actions) its body carries an
`"error":"..."` result.

## Reading the numbers

The generator, Next server, Docker Postgres/GoTrue/PostgREST and Redis shim share one machine, and
`next start` is one Node process. Compare shapes (where throughput flattens, which page is slowest),
not absolute numbers, with production.
