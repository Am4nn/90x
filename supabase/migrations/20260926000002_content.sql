-- ===========================================================================
-- CONTENT
-- Content tables: approved users read them, the app never writes them.
-- Natural text keys (slugs).
-- ===========================================================================

create table public.sources (
    id      text primary key,
    name    text not null,
    domain  text not null,
    url     text,
    license text,
    role    text not null check (role in ('cards', 'enrich', 'reference'))
);

create table public.topics (
    slug        text primary key,
    parent_slug text references public.topics (slug) on delete set null,
    domain      text not null check (domain in
                  ('dsa', 'system_design', 'cs', 'java', 'sql', 'lld', 'ai', 'behavioral', 'competitive')),
    name        text not null,
    description text,
    importance  real not null default 0.5 check (importance between 0 and 1),
    sort        int not null default 0
);
create index topics_domain_idx on public.topics (domain, sort);

-- Edges of the Pattern Map (and topic maps for other areas).
create table public.topic_links (
    from_slug text not null references public.topics (slug) on delete cascade,
    to_slug   text not null references public.topics (slug) on delete cascade,
    primary key (from_slug, to_slug)
);

create table public.problems (
    slug          text primary key,
    kind          text not null check (kind in ('leetcode', 'competitive')),
    lc_number     int,
    title         text not null,
    difficulty    text not null check (difficulty in ('Easy', 'Medium', 'Hard')),
    pattern_slug  text references public.topics (slug) on delete set null,
    topic_slugs   text[] not null default '{}',
    tags          text[] not null default '{}',
    importance    real not null default 0 check (importance between 0 and 1),
    nc150         boolean not null default false,
    blind75       boolean not null default false,
    companies     jsonb not null default '{}'::jsonb,
    statement_md  text,
    solutions     jsonb not null default '{}'::jsonb,
    video_id      text,
    url           text,
    source_id     text references public.sources (id),
    updated_at    timestamptz not null default now()
);
create index problems_pattern_idx on public.problems (pattern_slug, importance desc);
create index problems_kind_idx on public.problems (kind, importance desc);
create unique index problems_lc_number_idx on public.problems (lc_number) where lc_number is not null;

create table public.documents (
    id          text primary key,
    topic_slug  text references public.topics (slug) on delete set null,
    domain      text not null,
    title       text not null,
    body_md     text not null,
    url         text,
    source_id   text references public.sources (id),
    sort        int not null default 0,
    updated_at  timestamptz not null default now()
);
create index documents_topic_idx on public.documents (topic_slug, sort);
create index documents_domain_idx on public.documents (domain);

create table public.card_batches (
    id                uuid primary key default gen_random_uuid(),
    domain            text not null,
    topic_slugs       text[] not null default '{}',
    created_at        timestamptz not null default now(),
    ai_pass_rate      real,
    sample_pass_rate  real,
    status            text not null default 'draft'
                        check (status in ('draft', 'published', 'rejected'))
);

create table public.cards (
    id           uuid primary key default gen_random_uuid(),
    batch_id     uuid references public.card_batches (id) on delete cascade,
    topic_slug   text references public.topics (slug) on delete set null,
    problem_slug text references public.problems (slug) on delete cascade,
    document_id  text references public.documents (id) on delete set null,
    format       text not null check (format in ('typed', 'flash', 'mcq', 'output', 'bug')),
    difficulty   text check (difficulty in ('Easy', 'Medium', 'Hard')),
    prompt_md    text not null,
    options      jsonb,
    answer_md    text not null,
    key_points   jsonb not null default '[]'::jsonb,
    source_refs  jsonb not null default '[]'::jsonb,
    quality      jsonb not null default '{}'::jsonb,
    status       text not null default 'draft' check (status in ('draft', 'live', 'retired')),
    flag_count   int not null default 0,
    created_at   timestamptz not null default now()
);
create index cards_topic_live_idx on public.cards (topic_slug) where status = 'live';
create index cards_batch_idx on public.cards (batch_id);

alter table public.sources      enable row level security;
alter table public.topics       enable row level security;
alter table public.topic_links  enable row level security;
alter table public.problems     enable row level security;
alter table public.documents    enable row level security;
alter table public.card_batches enable row level security;
alter table public.cards        enable row level security;

-- Read-only for approved users. No insert/update/delete policies.
create policy sources_read      on public.sources      for select to authenticated using (public.is_approved());
create policy topics_read       on public.topics       for select to authenticated using (public.is_approved());
create policy topic_links_read  on public.topic_links  for select to authenticated using (public.is_approved());
create policy problems_read     on public.problems     for select to authenticated using (public.is_approved());
create policy documents_read    on public.documents    for select to authenticated using (public.is_approved());
create policy card_batches_read on public.card_batches for select to authenticated using (public.is_admin());
create policy cards_read        on public.cards        for select to authenticated
  using (public.is_approved() and (status = 'live' or public.is_admin()));
