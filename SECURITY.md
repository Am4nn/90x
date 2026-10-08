# Security

90x is an interview-prep app. Sign-in is Google only, and an admin switch decides whether a new sign-in is approved automatically or waits for an admin. This file records the threat model, the
trust boundaries the code relies on, and the decisions a future change must not
reverse by accident.

## Threat model

Actors: an anonymous visitor, a pending or rejected user, an approved user, a
*friend* (who may see some rows), an admin, QStash, and an attacker holding a
session.

Assets: a user's own notes, check-ins, card answers, coach threads, memory,
stories, mock transcripts, push subscriptions, and the shared monthly AI budget.

## Trust boundaries

- **The database.** Drizzle connects as a role row-level security does not apply
  to, so the boundary is each query's `WHERE user_id = viewer.id`, not the
  database. Every server query is scoped to the signed-in user (from
  `requireViewer()` in `@/lib/auth/viewer`) or is admin-only behind
  `viewer.isAdmin` (return `notFound()` to everyone else).
- **The Data API is closed. The browser never talks to an app table.** The publishable key in every browser bundle
  reaches Supabase Auth (Google sign-in, session refresh, sign-out) and nothing else. Since migration 042, `anon` and
  `authenticated`, the roles a Data API (`/rest/v1`) or GraphQL request runs as, hold no privilege of any kind in
  schema `public`: no USAGE on the schema, nothing on any table, view, column, sequence or function, and no default
  privileges on what a later migration adds. Every read and write goes over the server's own Postgres connection
  (Drizzle) or, in tests and admin tooling, `service_role`; the proxy's approval lookup included. Row security stays
  on and the policies stay as a backstop. `check-rls.ts` asserts all of this in CI and tries every table and helper
  as an anonymous caller and as a signed-in user; `job_recorder` (the backup workflow's insert-only login) is
  unaffected. A new table needs no extra step to stay closed; never grant the API roles anything to make a client
  query work: write a server action instead.
  Optional belt and braces, in the Supabase dashboard: Project Settings > Data API, remove `public` from the exposed
  schemas (or switch the Data API off; nothing of ours uses it), and Authentication > Sign In / Providers, keep only
  Google enabled.

  **Rolling the app back past the closed Data API.** A build from before the app stopped using the Data API (commit
  `f79c000`, "Move the last Data API calls to the server connection") breaks against a database with 042 without
  any error showing: its proxy reads no approval row, so admins get a 404 on `/admin` and are shut out by
  maintenance mode like everyone else; the admin approval decision always fails; the one-tap minutes are dropped.
  Roll the code back only after putting back what 041 left, in the SQL editor:

  ```sql
  grant usage on schema public to anon, authenticated;
  grant select on all tables in schema public to authenticated;
  revoke select on public.profiles, public.lessons, public.app_settings, public.problem_reports, public.job_runs
      from authenticated;
  grant select (user_id, name, avatar_url) on public.profiles to authenticated;
  grant select (topic_slug, title, summary, body_md, practice, source_refs, words, generated_at, created_at)
      on public.lessons to authenticated;
  grant update (minutes) on public.checkins to authenticated;
  grant update (name, avatar_url) on public.profiles to authenticated;
  grant update (status, decided_at, decided_by) on public.user_approvals to authenticated;
  grant execute on function public.is_admin(), public.is_approved(), public.is_friend(uuid),
      public.current_user_email() to authenticated;
  ```

  Re-run 042 once the current code is back. `check-rls.ts` restores the same list inside its rolled-back
  transaction to test the policies, so the two stay in step.
- **Sessions.** `getViewer` (`@/lib/auth/viewer`) verifies the session cookie locally with `auth.getClaims()`, not
  with a call to Supabase Auth: the access token's ES256 signature against the project's JWKS (fetched only from
  `NEXT_PUBLIC_SUPABASE_URL`, cached 10 minutes; `jku`/`x5u`/`jwk` headers are ignored) and its `exp`. A token that
  is not asymmetric with a known `kid` (HS256, `alg: none`, a stranger's key) is sent to Supabase Auth to verify,
  which refuses it. Every failure, including a JWKS that cannot be fetched, is "signed out", never "trusted". Only
  `sub` is taken from the token, and only from a token for the `authenticated` role and audience; approval, admin,
  set-up and the email are read from the database in one query on every request, so a rejected, demoted or deleted
  user is refused on their next request. `session-claims.test.ts` and the break-in sweep's "forged sessions" round
  try alg none, algorithm confusion, foreign keys, edited payloads, expired tokens, withdrawn approval and deleted
  accounts. The trade-off is in Known gaps. The proxy still refreshes an expired token (`getSession`) and asks
  Auth itself (`getUser`) for `/` and `/admin`.
- **HTTP.** A page must never render private data to a signed-out or non-owner
  visitor; a route must never answer a forged or missing signature. The
  security headers are set in `web/next.config.ts` and asserted by the break-in
  sweep.
- **The model prompt.** The display name and coach memory are user-controlled and
  can reach another user's model context. `sanitizeForPrompt` in
  `@/lib/coach/prompt-safety` strips control and bidi characters at that
  boundary.
- **Cost.** Every paid model call asks `aiGate()` (`@/lib/ai/guard`) first. It stops the call when an admin has
  paused AI, when spend today or this month has reached twice its cap (unless the hard-stop switch is off), when total spend
  has reached the lifetime cap (always, whatever the switch says), or when this person has reached their own daily
  cap. The caps are server-side and for admins only: a person who hits their allowance is told it resets tomorrow,
  never what the allowance is. Spend is metered in Redis and rebuilt from `ai_usage` when a meter is
  missing or unreadable, so a Redis restart cannot reset it. The admin gets an email at 80% of a cap and at the stop.
  `ai-guard-coverage.test.ts` fails if any file that picks a model does not ask the guard, or any call lacks a
  `maxOutputTokens`. Beneath it, per-user windows bound each paid action (`@/lib/upstash/rate-limit`: solution review,
  mock scoring, grading; `@/lib/coach/rate-limit`: chat). The caps, switches and the auto-approve setting are
  `app_settings` rows, read and written only over the server connection by an admin.
- **Admin.** `/admin/**` is locked twice: in `proxy.ts` (signed out goes to sign-in, anyone else who is not an approved
  admin gets a real 404, including action requests posted to admin URLs) and in each page (`requireAdmin()`) and
  action (`adminViewer()`). Server actions can be called from any URL by id, so the action check is the one that
  cannot be dropped; `admin-guard.test.ts` fails if a page or action under `src/app/admin` lacks it.
- **Model prompts.** What a person writes (a card answer, their code, a mock transcript, memory material) is fenced in
  a tagged block with a system line saying it is data, never instructions (`fence` / `untrustedNote` in
  `@/lib/coach/prompt-safety`). Coach tools take the user id from the server, never from the model, and action tools
  only propose, so an injected instruction cannot read another person's data or change anything without a click.
  A scope rule keeps the Coach on interview prep. These reduce misuse; they do not make a model immune, so anything
  that rewards a grade (XP, leagues) must not rest on AI-graded answers alone.

## Maintenance mode (kill switch)

Two switches take the app down. Both answer pages with the maintenance page and API routes and server actions
with `{ "error": "maintenance" }`, all `503` with `Retry-After: 300`, `Cache-Control: no-store` and
`x-90x-maintenance: 1` (an open app tab reloads onto the maintenance page when it sees it).

- **The admin switch** (`/admin/settings`, Maintenance) is two `app_settings` rows mirrored to Redis
  (`90x:maintenance`) on save. It has its own form and action, so saving any other setting never changes it, and
  the card shows what the app obeys right now (Redis) next to what is stored, with Re-apply when they differ.
  The proxy reads the Redis copy from an in-memory cache that refreshes in the background every 10 seconds, so
  an everyday request makes no network call; only an instance that sat idle for over a minute waits for one fresh
  read (at most 1.5 seconds) instead of serving its old answer once. A failed read keeps the last known value, so a Redis outage neither
  closes an open app nor opens a closed one; only a new instance that has never read it counts as live (fail
  open). While it is on, approved admins use everything and see a banner; everyone else is turned away. Still
  reachable: `/maintenance`, `/admin/**` (behind its own lock), `/auth/**` and the test sign-in, the
  scheduled-job routes (which skip, answering 200), `/privacy`, `/terms`, `/delete-account`, `/offline`,
  `/api/health` and static files. A server action, or any other write to a page path, is refused on any URL, an
  open one included, unless the viewer is an admin. The proxy matcher skips only real static files (build
  output, `/icons/`, `/splash/` and root-level files), and always runs for a request with a `next-action`
  header: a path the proxy skips also skips the server actions posted to it. Jobs, push and email do not send,
  and `aiGate()` refuses anyone but an admin. Scheduled jobs are skipped, not deferred: the job route answers
  200 with `{ "skipped": "maintenance" }` (recorded as "skipped" in Analytics), so QStash counts the call done and
  never retries it. Nothing is queued for later: a morning push, digest or weekly review whose hour fell inside
  the window does not go out when the switch is turned off. Sign-ups still write: `/auth/callback` stays open,
  so a new person's Google sign-in creates their account, fills their profile name and avatar, records their
  sign-up source and, while "approve new sign-ins automatically" is on, approves them. They then land on the
  maintenance page like everyone else.
- **The break-glass** `MAINTENANCE_MODE=1` blocks everyone, admins included, and everything but reads of
  `/maintenance` and `/api/health`; every write is refused. It is read from the environment alone: no database,
  Redis or session is consulted, so nothing an attacker holds can lift it. Set it in Vercel and redeploy; the
  admin switch cannot turn it off. Here the job routes and `/auth/callback` are refused too (503), so no
  sign-up writes. QStash retries a refused job a few times with backoff (its default); a retry that lands after
  the break-glass is lifted runs late, and one that never gets through is dropped.

`/api/health` reports `maintenance: true|false` and nothing else about it (never the message).

### Real compromise (a stolen admin account, leaked keys)

Maintenance mode stops the app, not Supabase. The publishable key is in every browser bundle, but since 042 it
reaches only Supabase Auth: the Data API refuses every table to anyone without the server's credentials (see
Trust boundaries). What a stolen session or key still buys is a signed-in session at Auth, and what leaked
server credentials buy is everything. So for a real compromise, do all of these:

1. Set `MAINTENANCE_MODE=1` in Vercel and redeploy. The app is closed to everyone.
2. Sign everyone out: in the Supabase dashboard, Project Settings > JWT Keys, rotate the signing key and revoke
   the old one (every access token stops working), then run `delete from auth.sessions;` in the SQL editor
   (their refresh tokens go with them) so no session can be refreshed.
3. If the Data API is still switched on, switch it off: Project Settings > Data API. Nothing of ours uses it, so
   it can stay off.
4. Rotate the keys if they may have leaked: Project Settings > API Keys, create new publishable and secret keys,
   delete the old ones, and update `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY` in Vercel.
   Rotate the database password (`DATABASE_URL`, `DIRECT_URL`) and the Upstash and QStash tokens the same way if
   they could have been read.
5. Check `user_approvals` for admins and approvals nobody meant to give, and fix them in the SQL editor.
6. Remove `MAINTENANCE_MODE`, redeploy.

## Breaking in, on purpose

`bun run break-in` attacks the app and fails the build if anything gives:

```bash
bun run break-in                              # direct round against a local Supabase
bun run break-in --http=http://localhost:3000 # direct + the HTTP sweep
```

It builds its own users and rows and removes them all at the end, so it runs
against any throwaway database. CI runs the direct round beside the database
checks and the HTTP sweep in the e2e job.

## Rate-limit failure decisions

| Limiter | Fails | Why |
|---|---|---|
| Coach chat (`@/lib/coach/rate-limit`) | closed | The AI budget is small, so cost safety beats availability: with the meter down a message is refused with the usual 429 ("send more in 1 minute") rather than sent unmetered. |
| Review / mock / grading (`@/lib/upstash/rate-limit`) | closed | These are paid calls with no other per-user bound; running them unmetered is worse than refusing. |
| Feed fetch and answer (`takeFeedSlot`, 300 an hour) | open | Serving a card costs nothing, so a Redis blip must not lock readers out. It exists to slow a script harvesting answers. |
| AI spend guard (`@/lib/ai/guard`) | open when the meters are unreadable | Pause always works (it reads no meter). A stop that depended on Redis and the database both being up would fail exactly when they struggle; the per-user windows above stay closed, and the provider's own limit is the backstop. |

## Test sign-in

`/api/test/sign-in` mints sessions for the Playwright suite and ships in every
build. It answers only when all four hold: `E2E=1`, `VERCEL` unset,
`NEXT_PUBLIC_SUPABASE_URL` is the local CLI stack, and `ALLOW_TEST_SIGN_IN=1`.
Only the e2e CI job sets all four.

## Launch decisions

- **Everything is behind sign-in.** There are no anonymous sample cards.
- **Auto-approve.** With the Admin switch on, a new Google sign-in is approved straight away (`auth/callback`), and only a
  request still pending is touched. Off, people wait on `/pending` for an admin.
- **BYOK (users' own provider keys) is after launch.**
- **Nothing in the repo may be a secret.** `gitleaks` runs in CI and the only env file committed is
  `.env.example`.
- **Vercel deploys only `main`** (`web/vercel.json`, `git.deploymentEnabled`). Pull-request branches get no preview
  deployment, so unreviewed code never runs against the production environment variables.
- **Supabase Auth has Google only.** The email, phone and anonymous providers are off.
- **Provider-side backstops (set in the dashboards, not in code):** the model provider account is prepaid with no
  more balance than the AI ceiling, the Vercel Firewall rate-limits `/api/` per IP (the threshold lives in the Vercel dashboard, not here), and
  `UPSTASH_VECTOR_REST_READONLY_TOKEN` is set in production. Keep a Vercel spend limit too. An app bug must never be
  able to spend past what the provider allows.

## Known gaps

- **A signed-out session lives until its token expires.** Sessions are verified locally (see Trust boundaries), so
  signing out on another device, or revoking a refresh token, does not end a session whose access token is still
  valid: it keeps working for up to the JWT expiry (1 hour, `jwt_expiry`), and then cannot refresh. Approval and
  deletion are not affected: they are read from the database on every request. Lowering `jwt_expiry` shortens the
  window.

- **No `script-src` in the Content-Security-Policy.** The App Router emits inline
  bootstrap scripts, so a script policy needs a per-request nonce, which would make
  the static landing page and `/try` render on every request (a latency cost we
  chose not to pay), and a wrong one blanks the page. The CSP is
  `frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'`
  plus the other headers; the session cookie stays readable by scripts (Supabase's
  browser client needs it), so an XSS would still reach the session.
