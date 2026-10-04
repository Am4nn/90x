-- ===========================================================================
-- LIBRARY: SECTIONS AND OPENED LESSONS
-- The Library's topic list groups an area's topics under headings (SQL:
-- Foundations, Querying, Performance). `topics.section` names the heading a
-- top-level topic sits under; null means the area has no sections yet and the
-- page shows one group.
--
-- `topic_opens` records that a reader spent real time on a lesson (a minute in
-- view) without finishing it, so the list can tell "opened" from "not started".
-- Studied lessons stay in topic_progress; studied implies opened.
--
-- Purely additive: the app reads both and copes with a null section.
-- ===========================================================================
alter table public.topics add column section text;

create table public.topic_opens (
    user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
    topic_slug text not null references public.topics (slug) on delete cascade,
    opened_at  timestamptz not null default now(),
    primary key (user_id, topic_slug)
);

alter table public.topic_opens enable row level security;

-- Owner: full access to their own rows (approved users only may write).
create policy topic_opens_owner on public.topic_opens for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_approved());
