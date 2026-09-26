-- ===========================================================================
-- CHECK-INS + INTEGRATIONS
-- A check-in records one attempt at a problem. The owner sees everything;
-- approved friends see it through checkins_public, which leaves out the note.
-- ===========================================================================

create table public.checkins (
    id                uuid primary key default gen_random_uuid(),
    user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
    problem_slug      text not null references public.problems (slug) on delete cascade,
    result            text not null check (result in ('solved', 'hints', 'failed')),
    attempts          int check (attempts > 0),
    minutes           int check (minutes between 0 and 600),
    minutes_suggested int check (minutes_suggested between 0 and 600),
    note              text,
    source            text not null default 'manual' check (source in ('manual', 'leetcode_sync')),
    external_id       text,
    created_at        timestamptz not null default now()
);
create index checkins_user_idx on public.checkins (user_id, created_at desc);
create index checkins_problem_idx on public.checkins (problem_slug);
create unique index checkins_external_idx on public.checkins (user_id, external_id)
  where external_id is not null;

alter table public.checkins enable row level security;

create policy checkins_owner on public.checkins for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_approved());

-- Friends' view. Runs with the view owner's rights (bypassing the owner-only
-- policy above), so it filters to approved readers itself and never exposes
-- the note column.
create view public.checkins_public as
  select id, user_id, problem_slug, result, attempts, minutes, source, created_at
  from public.checkins
  where public.is_approved();

revoke all on public.checkins_public from anon;
grant select on public.checkins_public to authenticated;

create table public.integration_status (
    user_id              uuid not null references auth.users (id) on delete cascade,
    provider             text not null check (provider in ('leetcode')),
    enabled              boolean not null default true,
    last_success_at      timestamptz,
    last_attempt_at      timestamptz,
    consecutive_failures int not null default 0,
    totals               jsonb,
    primary key (user_id, provider)
);

alter table public.integration_status enable row level security;

create policy integration_status_owner on public.integration_status for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
