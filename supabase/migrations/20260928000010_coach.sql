-- ===========================================================================
-- COACH
-- Each user's coach is theirs alone: threads,
-- messages, memory, solution reviews, stories, mock details and weekly
-- reviews are owner-only. Friends see mock scores, so a
-- mock's public row is readable by approved users and its transcript lives
-- in a separate owner-only table.
-- ===========================================================================

create table public.coach_threads (
    id         uuid primary key default gen_random_uuid(),
    user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
    kind       text not null default 'chat' check (kind in ('chat', 'lesson', 'review', 'mock')),
    title      text not null default '',
    ref        text,
    memory_extracted_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create index coach_threads_user_idx on public.coach_threads (user_id, updated_at desc);

create table public.coach_messages (
    id         uuid primary key default gen_random_uuid(),
    thread_id  uuid not null references public.coach_threads (id) on delete cascade,
    user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
    role       text not null check (role in ('user', 'assistant')),
    parts      jsonb not null default '[]'::jsonb,
    citations  jsonb not null default '[]'::jsonb,
    created_at timestamptz not null default now()
);
create index coach_messages_thread_idx on public.coach_messages (thread_id, created_at);

create table public.coach_memory (
    id         uuid primary key default gen_random_uuid(),
    user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
    kind       text not null check (kind in ('habit', 'strength', 'goal', 'preference', 'context')),
    text       text not null check (length(text) between 1 and 500),
    evidence   jsonb not null default '[]'::jsonb,
    status     text not null default 'active' check (status in ('active', 'improving', 'resolved')),
    source     text not null default 'coach' check (source in ('user', 'coach')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create index coach_memory_user_idx on public.coach_memory (user_id, status);

create table public.solution_reviews (
    id                uuid primary key default gen_random_uuid(),
    user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
    problem_slug      text not null references public.problems (slug) on delete cascade,
    checkin_id        uuid references public.checkins (id) on delete set null,
    thread_id         uuid references public.coach_threads (id) on delete set null,
    language          text not null,
    code              text not null check (length(code) <= 20000),
    correct           boolean,
    complexity        jsonb not null default '{}'::jsonb,
    review            jsonb not null default '{}'::jsonb,
    pattern_lesson    text,
    next_problem_slug text references public.problems (slug) on delete set null,
    created_at        timestamptz not null default now()
);
create index solution_reviews_user_idx on public.solution_reviews (user_id, created_at desc);

create table public.stories (
    id         uuid primary key default gen_random_uuid(),
    user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
    title      text not null check (length(title) between 1 and 120),
    situation  text not null default '',
    task       text not null default '',
    action     text not null default '',
    result     text not null default '',
    tags       text[] not null default '{}',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- Public part of a mock: type, topic, score. Friends see these.
create table public.mocks (
    id         uuid primary key default gen_random_uuid(),
    user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
    type       text not null check (type in ('design', 'behavioral')),
    topic      text not null default '',
    status     text not null default 'running' check (status in ('running', 'done', 'abandoned')),
    score      int check (score between 0 and 100),
    started_at timestamptz not null default now(),
    ended_at   timestamptz
);
create index mocks_user_idx on public.mocks (user_id, started_at desc);

-- Private part of a mock: the conversation and the feedback.
create table public.mock_details (
    mock_id       uuid primary key references public.mocks (id) on delete cascade,
    user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
    thread_id     uuid references public.coach_threads (id) on delete set null,
    prompt        text not null default '',
    rubric_scores jsonb not null default '{}'::jsonb,
    feedback_md   text
);

create table public.weekly_reviews (
    id                uuid primary key default gen_random_uuid(),
    user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
    week_start        date not null,
    formula_score     int check (formula_score between 0 and 100),
    coach_score       int check (coach_score between 0 and 100),
    summary_md        text not null default '',
    suggested_changes jsonb not null default '[]'::jsonb,
    accepted          boolean,
    created_at        timestamptz not null default now(),
    unique (user_id, week_start)
);

alter table public.coach_threads enable row level security;
alter table public.coach_messages enable row level security;
alter table public.coach_memory enable row level security;
alter table public.solution_reviews enable row level security;
alter table public.stories enable row level security;
alter table public.mocks enable row level security;
alter table public.mock_details enable row level security;
alter table public.weekly_reviews enable row level security;

create policy coach_threads_owner on public.coach_threads for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_approved());
create policy coach_messages_owner on public.coach_messages for all to authenticated
  using (user_id = auth.uid()) with check (
    user_id = auth.uid() and public.is_approved()
    and exists (select 1 from public.coach_threads t where t.id = thread_id and t.user_id = auth.uid())
  );
create policy coach_memory_owner on public.coach_memory for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_approved());
create policy solution_reviews_owner on public.solution_reviews for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_approved());
create policy stories_owner on public.stories for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_approved());
create policy mocks_owner on public.mocks for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_approved());
create policy mocks_read_approved on public.mocks for select to authenticated using (public.is_approved());
create policy mock_details_owner on public.mock_details for all to authenticated
  using (user_id = auth.uid()) with check (
    user_id = auth.uid() and public.is_approved()
    and exists (select 1 from public.mocks m where m.id = mock_id and m.user_id = auth.uid())
  );
create policy weekly_reviews_owner on public.weekly_reviews for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_approved());

create trigger coach_threads_touch before update on public.coach_threads
  for each row execute function public.touch_updated_at();
create trigger coach_memory_touch before update on public.coach_memory
  for each row execute function public.touch_updated_at();
create trigger stories_touch before update on public.stories
  for each row execute function public.touch_updated_at();
