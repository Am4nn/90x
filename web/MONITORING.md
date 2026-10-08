# Monitoring

Errors go to Sentry, uptime is watched by UptimeRobot (free plan, 50 monitors). Sentry stays
off until its DSN is set (steps below). With no `NEXT_PUBLIC_SENTRY_DSN`,
Sentry is disabled and nothing is sent (local, CI and e2e).

## What the code does

- Sentry runs on the server (`src/instrumentation.ts`, with `onRequestError`) and in the
  browser (`src/instrumentation-client.ts`). Every `error.tsx` and `global-error.tsx`
  reports to it.
- Errors only: browser tracing is 0, server tracing is 10%, no Session Replay.
- Privacy: `sendDefaultPii` is off, and `src/lib/monitoring/sentry-options.ts` strips
  email, IP, cookies, headers and request bodies, keeps only the user id, and drops
  console, fetch, XHR and click breadcrumbs so prompts and answers never leave.
- `GET /api/health` returns 200 when Postgres (`select 1`) and Redis (`ping`) answer
  within 3 s each, else 503. When healthy the body is
  `{"ok":true,"checks":{"database":"up","redis":"up"},"version":{"commit":"750b858","branch":"main","region":"bom1"}}`;
  a failing check shows `"down"` and `ok` is false (never error text). `version` says which deploy answered
  (short commit, branch, region; null outside Vercel).
  It skips the proxy, so it makes no Supabase Auth call and works signed out.
  The database and Redis results are cached 15 s per instance (a burst shares one check), so a change
  shows within about 15 s; `maintenance` is read fresh each time.

## Owner steps

### Sentry

1. sentry.io > create a project, platform Next.js.
2. Copy the DSN (Settings > Client Keys).
3. Vercel > Settings > Environment Variables: add `NEXT_PUBLIC_SENTRY_DSN` for Production
   (Vercel deploys only `main`, so there is no Preview environment to set), then redeploy. (It is read at build time for the browser.)
4. Optional, readable stack traces: create an auth token (Settings > Auth Tokens) and add
   `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` in Vercel. Note: source map upload
   is not wired in `next.config.ts` yet, so these three do nothing until it is.
5. Add an alert rule to email the owner's alert email (set in Sentry) on new issues.

### Uptime

- **UptimeRobot** (free; HTTP monitors send HEAD): `https://90x.amanarya.com/`, 5 minutes, set up
  2026-10-05. Alert contact: the owner's alert email (set in Sentry).
- **Sentry Uptime Monitoring** (one monitor included on the free plan; sends GET): Sentry > Alerts >
  Create Alert > Uptime Monitor, URL `https://90x.amanarya.com/api/health`, 1 or 5 minutes, alert
  to the same address. No keyword: the endpoint answers 503 when Postgres or Redis is down, and
  any non-2xx counts as down.
- A HEAD request to `/api/health` runs the same check (Next answers HEAD with the GET handler,
  minus the body), so an UptimeRobot HEAD monitor on it works as well, by status code alone.
