-- ===========================================================================
-- FEED
-- Answers, spaced-repetition state and flags are the answerer's own. Batch
-- review verdicts are admin-only. AI usage is written by the server and
-- readable by its user.
-- ===========================================================================

alter table public.profiles
  add column feed_topics        jsonb,
  add column diagnostic_done_at timestamptz;

alter table public.cards
  add column hidden boolean not null default false,
  add column risk   real;

alter table public.card_batches
  add column label       text,
  add column reviewed_by uuid references auth.users (id),
  add column reviewed_at timestamptz;

create table public.card_reviews (
    id           uuid primary key default gen_random_uuid(),
    user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
    card_id      uuid not null references public.cards (id) on delete cascade,
    answer       text not null default '',
    score        real not null check (score between 0 and 1),
    points_hit   jsonb not null default '[]'::jsonb,
    outcome      text not null check (outcome in ('correct', 'wrong', 'skipped')),
    graded_by    text not null check (graded_by in ('match', 'ai', 'self', 'options', 'skip')),
    used_options boolean not null default false,
    diagnostic   boolean not null default false,
    created_at   timestamptz not null default now()
);
create index card_reviews_user_idx on public.card_reviews (user_id, created_at desc);
create index card_reviews_card_idx on public.card_reviews (card_id, created_at desc);

create table public.card_state (
    user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
    card_id     uuid not null references public.cards (id) on delete cascade,
    stability   real not null,
    difficulty  real not null,
    due_at      timestamptz not null,
    reps        int not null default 0,
    lapses      int not null default 0,
    state       int not null default 0,
    last_review timestamptz,
    primary key (user_id, card_id)
);
create index card_state_due_idx on public.card_state (user_id, due_at);

create table public.card_flags (
    user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
    card_id    uuid not null references public.cards (id) on delete cascade,
    reason     text not null check (length(reason) between 1 and 500),
    created_at timestamptz not null default now(),
    primary key (user_id, card_id)
);

create table public.batch_review_items (
    batch_id   uuid not null references public.card_batches (id) on delete cascade,
    card_id    uuid not null references public.cards (id) on delete cascade,
    verdict    text not null check (verdict in ('good', 'bad')),
    note       text,
    decided_by uuid references auth.users (id),
    created_at timestamptz not null default now(),
    primary key (batch_id, card_id)
);

create table public.ai_usage (
    id         uuid primary key default gen_random_uuid(),
    user_id    uuid references auth.users (id) on delete set null,
    route      text not null,
    model      text not null,
    tokens_in  int not null default 0,
    tokens_out int not null default 0,
    cost_usd   double precision not null default 0,
    created_at timestamptz not null default now()
);
create index ai_usage_created_idx on public.ai_usage (created_at);

alter table public.card_reviews enable row level security;
alter table public.card_state enable row level security;
alter table public.card_flags enable row level security;
alter table public.batch_review_items enable row level security;
alter table public.ai_usage enable row level security;

create policy card_reviews_owner on public.card_reviews for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_approved());
create policy card_state_owner on public.card_state for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_approved());
create policy card_flags_owner on public.card_flags for all to authenticated
  using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() and public.is_approved());
create policy batch_review_items_admin on public.batch_review_items for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy ai_usage_owner on public.ai_usage for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- Hidden cards leave the feed for everyone but admins.
drop policy cards_read on public.cards;
create policy cards_read on public.cards for select to authenticated
  using (public.is_approved() and ((status = 'live' and not hidden) or public.is_admin()));
