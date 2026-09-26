-- ===========================================================================
-- TRACKER
-- A campaign holds the per-weekday template. Each local day gets missions
-- (built lazily on open and by the hourly job) and a status for the 90 Grid.
-- Friends can see days, campaigns and readiness; missions, the review
-- ladder, studied topics and push subscriptions are owner-only.
-- ===========================================================================

alter table public.profiles
  add column weekday_minutes   int check (weekday_minutes between 30 and 480),
  add column weekend_minutes   int check (weekend_minutes between 30 and 480),
  add column morning_push_hour int check (morning_push_hour between 0 and 23);

create table public.campaigns (
    id            uuid primary key default gen_random_uuid(),
    user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
    start_date    date not null,
    length_days   int not null check (length_days between 7 and 365),
    status        text not null default 'active' check (status in ('active', 'ended')),
    templates     jsonb not null,
    company_focus jsonb,
    created_at    timestamptz not null default now()
);
create unique index campaigns_one_active on public.campaigns (user_id) where status = 'active';

create table public.days (
    user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
    date        date not null,
    campaign_id uuid not null references public.campaigns (id) on delete cascade,
    status      text not null default 'pending' check (status in ('pending', 'done', 'partial', 'missed', 'revived')),
    closed_at   timestamptz,
    primary key (user_id, date)
);

create table public.missions (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
    date        date not null,
    slot_type   text not null check (slot_type in ('new_problem', 'review', 'topic', 'cards')),
    ref         text not null,
    est_minutes int not null check (est_minutes between 0 and 600),
    status      text not null default 'open' check (status in ('open', 'done', 'skipped', 'coming_soon')),
    reason      text not null default '',
    done_at     timestamptz,
    checkin_id  uuid references public.checkins (id) on delete set null,
    is_revive   boolean not null default false,
    unique (user_id, date, slot_type, ref)
);
create index missions_user_date_idx on public.missions (user_id, date);

create table public.problem_reviews (
    user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
    problem_slug text not null references public.problems (slug) on delete cascade,
    step         int not null check (step between 1 and 3),
    due_date     date not null,
    status       text not null default 'active' check (status in ('active', 'graduated', 'dismissed')),
    updated_at   timestamptz not null default now(),
    primary key (user_id, problem_slug)
);
create index problem_reviews_due_idx on public.problem_reviews (user_id, due_date) where status = 'active';

create table public.topic_progress (
    user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
    topic_slug text not null references public.topics (slug) on delete cascade,
    studied_at timestamptz not null default now(),
    primary key (user_id, topic_slug)
);

create table public.readiness_snapshots (
    user_id  uuid not null default auth.uid() references auth.users (id) on delete cascade,
    date     date not null,
    overall  int check (overall between 0 and 100),
    per_area jsonb not null default '{}'::jsonb,
    primary key (user_id, date)
);

create table public.push_subscriptions (
    id         uuid primary key default gen_random_uuid(),
    user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
    endpoint   text not null unique,
    p256dh     text not null,
    auth       text not null,
    created_at timestamptz not null default now()
);

alter table public.campaigns enable row level security;
alter table public.days enable row level security;
alter table public.missions enable row level security;
alter table public.problem_reviews enable row level security;
alter table public.topic_progress enable row level security;
alter table public.readiness_snapshots enable row level security;
alter table public.push_subscriptions enable row level security;

-- Owner: full access to their own rows (approved users only may write).
create policy campaigns_owner on public.campaigns for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_approved());
create policy days_owner on public.days for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_approved());
create policy missions_owner on public.missions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_approved());
create policy problem_reviews_owner on public.problem_reviews for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_approved());
create policy topic_progress_owner on public.topic_progress for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_approved());
create policy readiness_owner on public.readiness_snapshots for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_approved());
create policy push_owner on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_approved());

-- Friends: public progress only.
create policy campaigns_read_approved on public.campaigns for select to authenticated using (public.is_approved());
create policy days_read_approved on public.days for select to authenticated using (public.is_approved());
create policy readiness_read_approved on public.readiness_snapshots for select to authenticated using (public.is_approved());
