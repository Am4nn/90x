-- ===========================================================================
-- TAXONOMY + PREMIUM + PATTERN TRICKS
-- Problems get 1-4 techniques besides their primary pattern, and a premium
-- flag (LeetCode Premium problems can't be opened without a subscription).
-- Users say whether they have Premium; missions skip premium problems if not.
-- ===========================================================================

alter table public.problems add column premium boolean not null default false;
alter table public.problems add column techniques text[] not null default '{}';
create index problems_techniques_idx on public.problems using gin (techniques);

alter table public.profiles add column has_leetcode_premium boolean not null default false;

-- Trick catalog per pattern.
create table public.pattern_tricks (
    id            text primary key,
    pattern_slug  text not null references public.topics (slug) on delete cascade,
    name          text not null,
    idea_md       text not null,
    snippets      jsonb not null default '{}'::jsonb,
    problem_slugs text[] not null default '{}',
    sort          int not null default 0
);
create index pattern_tricks_pattern_idx on public.pattern_tricks (pattern_slug, sort);

alter table public.pattern_tricks enable row level security;
create policy pattern_tricks_read on public.pattern_tricks for select to authenticated using (public.is_approved());
