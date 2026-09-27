# Contributing

90x is an invite-only interview-prep app. Read []
for what it does and why, and []
for how the code is written. Breaking a rule in either is a bug even when the
tests pass.

## Getting it running

You need Bun and Docker.

```
cd web
bun install
cp .env.example .env.local
bun run db:start       # local Supabase: Postgres, auth, every migration
bun run dev
```

There is one environment. `web/.env.local` holds the same values Vercel does,
`.env.example` is the key list and explains every value.

This is **Next.js 16**, and its APIs differ from older versions. Read the
matching guide in `web/node_modules/next/dist/docs/` before writing framework
code: error boundaries take `retry`, not `reset`, and middleware is `proxy.ts`.

## Where things live

| Path | Holds |
|---|---|
| `web/src/app/` | routes, server actions, API routes and job handlers |
| `web/src/lib/<area>/` | logic per area: `tracker`, `feed`, `coach`, `library`, `activity`, `admin` |
| `web/src/components/` | shared UI: `form`, `skeleton`, `empty-state`, `route-error`, `chip-group` |
| `web/src/db/` | Drizzle schema. `pulled/` is generated, so don't edit it |
| `web/scripts/` | the `check:*` scripts, icon generation, admin and job setup |
| `web/e2e/` | Playwright specs, the e2e seed and a fake OpenAI-compatible model |
| `supabase/migrations/` | SQL migrations, the source of truth for the schema and RLS |

## The rules that are not style

- **Server queries bypass row-level security.** Drizzle connects as a role RLS
  does not apply to, so every query is scoped to the signed-in user's id from
  `requireViewer()`, or is admin-only behind `viewer.isAdmin` and returns
  `notFound()` to everyone else. `check:rls` and `check:coach-tools` prove it.
- **The app never writes content.** Problems, notes, topics and cards are
  read-only to the app outside the `/admin` review. Flag counts are the one
  exception.
- **AI runs on the server and is always metered.** Every call goes through
  `@/lib/ai`, logs to `ai_usage` and adds to the Redis cost meter. DeepSeek
  bills hidden thinking tokens, so short structured calls pass `NO_THINKING`.
- **The coach proposes, the user confirms.** Read tools run freely. An action
  tool only returns a proposal, and nothing changes until the user taps it.
- **Server actions never throw to the UI.** They validate with Zod, catch,
  log, and return a `FormState` with a short human error.

## Design

Dark theme only:

- Six text sizes (`text-display`, `text-title`, `text-heading`, `text-body`,
  `text-small`, `text-tag`), plus `text-dial` for the readiness dial.
- Colours from tokens only: no hex and no Tailwind palette colours.
- Borders on cards, not shadows. No native `<select>` or checkbox on desktop.
- Every route segment has a `loading.tsx` skeleton shaped like the page and an
  `error.tsx`. Empty data shows `EmptyState`, never a blank area.
- Mobile first at 390px. If a screen and its mockup disagree, fix the code or
  change the mockup on purpose.

`bun run check:tokens` enforces the first two, and its ceiling may only fall.

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
bun run test
bun run format:check   # bunx oxfmt to fix
bun run check:tokens
bun run check:dead     # knip: nothing exported and unused
bun run build
```

Against a local Supabase (`bun run db:start` first):

```
bun run check:rls
bun run check:tracker
bun run check:feed
bun run check:coach-tools
```

`bun run test:e2e` runs Playwright against a running build seeded by
`scripts/seed-e2e.ts` and the fake model in `e2e/fake-model.ts`. The e2e job in
`.github/workflows/ci.yml` shows the full setup.

`check:grading` and `check:coach` call the real model and cost a few cents.
Run them only when you've changed grading or coach memory.

CI runs all of this except the two model checks. The e2e job points the app at
a fake model, so no test ever calls a real one.

## Commits and pull requests

- One change per PR, to `main`. Never push to `main` directly or skip hooks.
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
