<p align="center">
  <img src="web/src/app/icon.svg" alt="90x" width="112" height="112">
</p>

<p align="center">
  <strong>Interview prep that plans your day and checks your answers.</strong><br>
  Pick 30, 60 or 90 days. 90x picks today's problems from your weakest areas,<br>
  grades what you type, and only raises your readiness when you do the work.
</p>

<p align="center">
  <a href="https://90x.amanarya.com"><strong>90x.amanarya.com</strong></a>
</p>

<p align="center">
  <a href="https://github.com/Am4nn/90x/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/Am4nn/90x/actions/workflows/ci.yml/badge.svg"></a>
  <img alt="Next.js 16" src="https://img.shields.io/badge/Next.js-16-000?logo=nextdotjs">
  <img alt="Supabase" src="https://img.shields.io/badge/Supabase-3ecf8e?logo=supabase&logoColor=white">
  <img alt="Upstash" src="https://img.shields.io/badge/Upstash-00e9a3?logo=upstash&logoColor=white">
  <a href="./LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-555"></a>
</p>

---

## Features

**Landing page.** `/` is the public front page: a pinned demo, a wall of Feed cards and Google sign-in. Signed-in users go straight to Today.

**Today.** A plan for the day from your weekday template: new problems, due reviews, a design topic, a "10 cards" mission, a mock or a story. Each mission has a one-line reason it was picked. A weekly focus from the Sunday review adds one focus problem and topic a day, and "+ Add a problem" adds extra work to an Extras list that carries over until you solve or remove it. Work earns XP, shown as +N XP where it is earned, with a total and a week chart on Me.

**90 Grid.** One square per campaign day, marked done, partial or missed. A missed day can be revived by making up its missions, which keeps the streak alive.

**Readiness.** A 0 to 100 score per area (DSA, system design, CS core, Java, SQL), built from how much of each area you've covered and how accurate you've been lately.

**Feed.** Cards across the topics you switch on, in 10 card types (pick one, order, match, bucket, assemble, numeric keypad, tap in place, claim grid, grid toggle, and written answers graded against the card's key points). FSRS schedules the next review. Any 10 cards span at least 4 areas, and you can bias the queue by difficulty.

**Library.** Nine tracks (DSA, Design, CS, Java, SQL, LLD, AI, Behavioural, Competitive) with search. Topics are grouped in sections with lessons, DSA has a Pattern Map of pattern tricks and problems, and everything links back to its sources.

**Check-ins.** Log a problem as solved, solved with hints, or failed. LeetCode sync can fill these in from your public profile.

**Coach.** A chat that remembers you. It searches the library and cites what it used, finds problems, reviews pasted solutions, teaches lessons, runs timed text mocks, keeps your STAR story bank and writes a weekly read that shows on Today and Me. Anything it wants to change needs your tap first.

**Friends.** Invite by email, accept, then compare readiness, streak and solved this week.

**Me.** Plan, settings, coach memory, stories, weekly reads, report a problem, and delete your account.

**Admin.** Approve users, review card batches and flagged cards, read reports and mail, set AI caps and the auto-approve switch, and see an analytics dashboard for growth, activation, return and cost.

It installs as an app on phone and desktop, keeps Today and the Feed available offline, and sends reminders by web push. Privacy and terms pages are public.

Sign-in is with Google, and every new account waits for an admin to approve it, unless auto-approve is on.

## How it works

```mermaid
flowchart LR
  USER["Browser / installed PWA"] --> APP["web/<br/>Next.js on Vercel"]
  APP --> DB[("Supabase<br/>Postgres + RLS, Auth")]
  APP --> RED[("Upstash Redis<br/>feed queue, limits, cost meter")]
  APP --> VEC[("Upstash Vector<br/>library search")]
  APP --> AI["AI provider<br/>via Vercel AI SDK"]
  APP --> AUD[("Cloudflare R2<br/>lesson audio, signed URLs")]
  APP -.-> SEN["Sentry"]
  QS["Upstash QStash<br/>scheduled jobs"] --> APP
  GHA["GitHub Actions<br/>nightly backup"] --> DB
  GHA --> BAK[("Cloudflare R2<br/>encrypted dumps")]
```

- An admin samples every card batch before it goes live.
- Every AI call runs on the server, is logged to `ai_usage`, and counts against daily, monthly and per-person caps that admins set. A hard stop and a lifetime ceiling sit above the caps.
- The coach answers library questions by searching an Upstash Vector index of the lessons and problem statements.
- QStash calls `/api/jobs/hourly` and `/api/jobs/leetcode-sync` (set up with `bun run schedule:jobs`).
- Lesson audio is served from a private R2 bucket through short-lived signed URLs.
- Vercel deploys `main` only. There are no preview deploys for PR branches.
- [`/api/health`](./web/MONITORING.md) reports whether Postgres and Redis answer.

## Stack

| | |
|---|---|
| App | Next.js 16, React 19 (React Compiler), TypeScript, Tailwind v4, shadcn/ui, TanStack Query |
| Data | Supabase Postgres with row-level security, Drizzle, Supabase Auth |
| Jobs and search | Upstash QStash, Redis and Vector |
| AI | Vercel AI SDK; DeepSeek by default, or Anthropic or any OpenAI-compatible endpoint |
| Monitoring | Sentry, Vercel Analytics and Speed Insights, UptimeRobot (see [web/MONITORING.md](./web/MONITORING.md)) |
| Storage | Cloudflare R2: lesson audio, and nightly encrypted `pg_dump` backups (see [BACKUPS.md](./BACKUPS.md)) |
| Tests | Vitest, Playwright with axe-core, a break-in security suite |

## Running your own copy

You need [Bun](https://bun.sh) and Docker.

```bash
cd web
bun install
cp .env.example .env.local    # every key is explained in the file
bun run db:start              # local Supabase with every migration applied
bun run dev
```

Sign in once (Google OAuth keys go in `.env.local`, see [CONTRIBUTING](./CONTRIBUTING.md#getting-it-running)), then make yourself an admin:

```bash
bun run admin:grant you@example.com
```

### Seed data

The local stack starts empty. Load the small catalog the end-to-end tests use.

```bash
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres bun run scripts/seed-e2e.ts
```

Run it from `web/`. The port is whatever `supabase status` reports.

## Documentation

| | |
|---|---|
| [CONTRIBUTING.md](./CONTRIBUTING.md) | setup, the rules, checks before a PR |
| [PRODUCT.md](./PRODUCT.md), [DESIGN.md](./DESIGN.md) | what the product is, how it looks |
| [SECURITY.md](./SECURITY.md) | threat model, reporting a vulnerability |
| [BACKUPS.md](./BACKUPS.md) | nightly backups, restore and the drill |
| [LOAD-TEST.md](./LOAD-TEST.md) | load test results |
| [web/README.md](./web/README.md) | the web app: commands and layout |
| [web/MONITORING.md](./web/MONITORING.md) | Sentry, uptime checks, `/api/health` |

## Repository

```
web/        the Next.js app, its tests and scripts
supabase/   config and SQL migrations, including row-level security
.github/    CI, the nightly backup and shared setup actions
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

The code is [MIT](./LICENSE). The study content keeps its sources' own licenses; see [NOTICE](./NOTICE).
