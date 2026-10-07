-- ===========================================================================
-- JOB RUNS
-- One row per run of a scheduled job, so /admin/analytics can show whether
-- each job ran, what it returned and how long it took. Before this, a run left
-- nothing the app could read: QStash and Vercel keep their logs for days.
--
--   job          the registry id (web/src/lib/jobs/registry.ts): hourly,
--                stale-sweep, weekly-reviews, leetcode-sync, db-backup
--   status       running while it works, then ok | failed | skipped
--                (skipped = it ran and found nothing to do)
--   duration_ms  set with finished_at
--   result       the job's own short summary, e.g. {"users": 41, "due": 2};
--                the app caps it at about 2 KB before writing
--   error        why it failed, capped
--
-- Server written and server read: the QStash routes write over the server
-- connection (which bypasses RLS), the nightly backup workflow writes with
-- its own database secret, and only the admin page reads. The API roles get
-- no policy and no grant, as for xp_events and problem_reports.
--
-- About 30 rows a day; the hourly job deletes rows older than 90 days.
-- Purely additive: the app tolerates the table being empty.
-- ===========================================================================
create table public.job_runs (
    id          bigserial primary key,
    job         text not null check (job ~ '^[a-z0-9-]{1,40}$'),
    started_at  timestamptz not null default now(),
    finished_at timestamptz,
    status      text not null check (status in ('running', 'ok', 'failed', 'skipped')),
    duration_ms integer check (duration_ms >= 0),
    result      jsonb not null default '{}',
    error       text check (char_length(error) <= 2000)
);

create index job_runs_job_started_idx on public.job_runs (job, started_at desc);

alter table public.job_runs enable row level security;

-- No policy: RLS denies every row to the API roles. The revoke is the belt to that brace.
revoke all on public.job_runs from anon, authenticated;
revoke all on sequence public.job_runs_id_seq from anon, authenticated;
