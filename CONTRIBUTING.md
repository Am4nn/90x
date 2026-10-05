# Contributing

90x is an invite-only interview-prep app. Read []
for what it does and why, and []
for how the code is written. Breaking a rule in either is a bug even when the
tests pass.

## Getting it running

You need Bun and Docker. Install Bun first: the repo pins `bun@1.4.0` in `web/package.json`.

```
cd web
bun install
cp .env.example .env.local
bun run db:start       # local Supabase: Postgres, auth, every migration
bun run dev
```

There is one environment. `web/.env.local` holds the same values Vercel does,
and `.env.example` is the key list and explains every value. The file points at
production once filled in, so keep scripts and one-off experiments away from
it: use the local Supabase from `db:start` instead. Never commit it.

Google sign-in needs `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` and
`SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET`, which `supabase/config.toml` reads for
the local stack. After your first sign-in, run `bun run admin:grant you@example.com`
to approve yourself as an admin. The local stack starts with the small seed
catalog the end-to-end tests use (`scripts/seed-e2e.ts`).

Vercel deploys `main` only (`web/vercel.json`), so a PR never gets a preview
deploy. Test it locally or in CI.

This is **Next.js 16**, and its APIs differ from older versions. Read the
matching guide in `web/node_modules/next/dist/docs/` before writing framework
code: error boundaries take `retry`, not `reset`, and middleware is `proxy.ts`.

## Where things live

| Path | Holds |
|---|---|
| `web/src/app/` | routes, server actions, API routes and job handlers |
| `web/src/app/(app)/` | the signed-in pages: Today, Feed, Library, Coach, Friends, Me |
| `web/src/app/admin/` | admin pages: users, cards, reports, mail, settings, analytics |
| `web/src/lib/<area>/` | logic per area: `tracker`, `feed`, `coach`, `library`, `xp`, `friends`, `ai`, `admin`, `analytics`, `offline` and more |
| `web/src/components/` | UI, shared (`form`, `skeleton`, `empty-state`, `route-error`, `chip-group`) and per area (`feed`, `coach`, `landing`) |
| `web/src/db/` | Drizzle schema. `pulled/` is generated, so don't edit it |
| `web/scripts/` | the `check:*` scripts, icon generation, admin and job setup, `break-in/`, `load/` and `db/restore-drill.sh` |
| `web/e2e/` | Playwright specs, the e2e seed and a fake OpenAI-compatible model |
| `archetypes.json` | the Feed card archetype registry the app reads |
| `supabase/migrations/` | SQL migrations, the source of truth for the schema and RLS |
| `.github/` | CI (`ci.yml`), the nightly backup (`db-backup.yml`) and shared setup actions |

Other docs: [DESIGN.md](DESIGN.md) and [PRODUCT.md](PRODUCT.md) for look and
purpose, [SECURITY.md](SECURITY.md) for the threat model, [BACKUPS.md](BACKUPS.md),
[LOAD-TEST.md](LOAD-TEST.md) and [web/MONITORING.md](web/MONITORING.md).

## The rules that are not style

- **Server queries bypass row-level security.** Drizzle connects as a role RLS
  does not apply to, so every query is scoped to the signed-in user's id from
  `requireViewer()`, or is admin-only behind `viewer.isAdmin` and returns
  `notFound()` to everyone else. `check:rls` and `check:coach-tools` prove it.
- **The app never writes content.** Problems, notes, topics and cards are
  read-only to the app outside the `/admin` review. Flag counts are the one
  exception.
- **AI runs on the server and is always metered.** Every call goes through
  `@/lib/ai`, logs to `ai_usage` and adds to the Redis cost meter, and the
  spend guard can stop it. DeepSeek bills hidden thinking tokens, so short
  structured calls pass `NO_THINKING`. User text goes into prompts as fenced
  data, and every call has an output limit.
- **The coach proposes, the user confirms.** Read tools run freely. An action
  tool only returns a proposal, and nothing changes until the user taps it.
- **Server actions never throw to the UI.** They validate with Zod, catch,
  log, and return a `FormState` with a short human error.
- **Every admin page checks the admin.** A test fails if one forgets. See
  [SECURITY.md](SECURITY.md) for the rest of the model.

## Design

Dark theme only, from [DESIGN.md](DESIGN.md):

- Six text sizes (`text-display`, `text-title`, `text-heading`, `text-body`,
  `text-small`, `text-tag`), plus `text-dial` for the readiness dial.
- Colours from tokens only: no hex and no Tailwind palette colours.
- Borders on cards, not shadows. No native `<select>` or checkbox on desktop.
- Every route segment has a `loading.tsx` skeleton shaped like the page and an
  `error.tsx`. Empty data shows `EmptyState`, never a blank area.
- Every action answers on the tap: update the screen first, then confirm.
- Mobile first at 390px. If a screen and its mockup disagree, fix the code or
  change the mockup on purpose.

`bun run check:tokens` enforces the colour and size rules, and its ceiling may only fall.

## Changing the database

Add a migration with `bun run db:new <name>`, apply it with `bun run db:reset`,
then `bun run db:pull` to regenerate the Drizzle types. Check that diff:
`drizzle-kit pull` mangles column names with a digit followed by a letter
(`p256dh` came back as `p256Dh`), and `scripts/fix-pulled-schema.ts` only
repairs the cases it knows about.

## Before you open a PR

From `web/`:

```
bun run typecheck
bun run lint           # ESLint and oxlint, a warning is a failure
bun run check:coverage # the tests, plus a coverage floor
bun run format:check   # bun run format to fix
bun run check:tokens
bun run check:dead     # knip: nothing exported and unused
bun run check:dupes    # jscpd: nothing written out twice
bun run check:cycles   # no circular imports
bun run check:shards   # every e2e spec is run by a CI shard
bun run check:archetypes
bun run build
bun run check:bundle   # after the build: the app still fits on a phone
```

`bun run test` is the plain Vitest run if you only want a quick answer.
`check:archetypes` fails when `archetypes.json` and the generated module
disagree: run `bun run generate:archetypes` after you edit the registry.

Against a local Supabase (`bun run db:start` first):

```
bun run check:rls
bun run check:tracker
bun run check:analytics
bun run check:feed
bun run check:friends
bun run check:coach-tools
bun run break-in      # attacks the service layer as the wrong user
```

`bun run test:e2e` runs Playwright against a running build seeded by
`scripts/seed-e2e.ts`, a Redis HTTP shim and the fake model in
`e2e/fake-model.ts`. The `e2e-shard` jobs in `.github/workflows/ci.yml` show the
full setup. CI splits the specs into two shards by name, so add a new spec's
name to a shard's `specs` list there. `check:shards` fails if you forget.

`check:grading` and `check:coach` call the real model and cost a few cents.
Run them only when you've changed grading or coach memory.

CI runs all of this except the two model checks, and also `check:audit`
(dependency advisories), `check:deps` (deprecated packages), `check:actions`
(outdated pinned actions) and gitleaks. A change that touches only docs or only
one part of the tree skips the jobs for the rest. The e2e jobs point the app at
a fake model, so no test ever calls a real one.

## Commits and pull requests

- One change per PR, to `main`. Never push to `main` directly or skip hooks.
- `main` deploys to production on merge, so a PR is not done until its checks pass.
- The commit message says what changed and why, in plain English.
- The PR description lists what changed per area, any decision you made and
  what it costs if it's wrong, which checks passed, and what you couldn't
  verify.

## Voice

This applies to commits, comments and every string that ships. Short and
plain, second person ("You missed…"), no exclamation marks, no emoji. Comments
explain why, not what.

## The licence

90x is under the [PolyForm Noncommercial License 1.0.0](./LICENSE). You can
read it, fork it, change it, run your own copy for yourself and send a pull
request. Using it for a commercial purpose is not allowed, and that includes
running it as a product or a service for other people.

By opening a pull request you license your contribution under the same terms.
