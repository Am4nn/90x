-- ===========================================================================
-- PROBLEM REPORTS
-- "Report a problem" in Me: what went wrong, plus the page, browser and app
-- version it happened on. The admin reads them at /admin/reports and marks
-- them resolved.
--
-- Server written and server read. The app inserts over the server connection
-- (which bypasses RLS) after a per-person rate limit, and the admin page reads
-- the same way. The API roles get no policy and no grant at all: a report can
-- hold someone's own words, so not even the author reads it back from a client.
--
-- user_id cascades, so deleting an account deletes its reports. resolved_by
-- is set null for the admin who closed it, so removing an admin does not
-- block on this table.
-- ===========================================================================
create table public.problem_reports (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid not null references auth.users (id) on delete cascade,
    message     text not null check (char_length(message) between 1 and 2000),
    doing       text check (char_length(doing) <= 1000),
    path        text check (char_length(path) <= 300),
    user_agent  text check (char_length(user_agent) <= 500),
    app_version text check (char_length(app_version) <= 64),
    created_at  timestamptz not null default now(),
    resolved_at timestamptz,
    resolved_by uuid references auth.users (id) on delete set null
);

create index problem_reports_open_idx on public.problem_reports (created_at desc) where resolved_at is null;
create index problem_reports_user_idx on public.problem_reports (user_id);

alter table public.problem_reports enable row level security;

-- No policy: RLS then denies every row to the API roles. The revoke is the
-- belt to that brace, as for xp_events.
revoke all on public.problem_reports from anon, authenticated;
