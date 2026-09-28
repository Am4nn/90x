-- Roadmaps as a checklist you tick off.
--
-- A roadmap.sh node carries no parent, so the grouping on their site is
-- whitespace in a diagram rather than data. Two attempts to rebuild the
-- hierarchy from geometry both landed near 80% accuracy, putting
-- "Event-Driven" under "Availability Patterns" when it belongs to
-- "Background Jobs". So this is a flat list in the diagram's own reading
-- order, with `kind` carrying the two levels of emphasis.
--
-- Only 7% of nodes map to a 90x topic, which is expected: roadmap.sh covers
-- a career path at finer grain (Layer 4 / Layer 7 / algorithms are three
-- nodes where we have one Load balancing topic), while our topics are the
-- interview subset. `topic_slug` links the ones that do match.

create table if not exists public.roadmap_nodes (
    id         text primary key,          -- "<roadmap>:<node id>"
    roadmap    text not null,             -- roadmap.sh slug, e.g. "system-design"
    domain     text not null,             -- which 90x area shows it
    label      text not null,
    kind       text not null check (kind in ('topic', 'subtopic')),
    sort       integer not null,
    topic_slug text references public.topics (slug) on delete set null
);

create index if not exists roadmap_nodes_domain_idx on public.roadmap_nodes (domain, roadmap, sort);

-- What each person has ticked off.
create table if not exists public.roadmap_progress (
    user_id  uuid not null references auth.users (id) on delete cascade,
    node_id  text not null references public.roadmap_nodes (id) on delete cascade,
    done_at  timestamptz not null default now(),
    primary key (user_id, node_id)
);

alter table public.roadmap_nodes enable row level security;
alter table public.roadmap_progress enable row level security;

drop policy if exists roadmap_nodes_read on public.roadmap_nodes;
create policy roadmap_nodes_read on public.roadmap_nodes
    for select to authenticated using (public.is_approved());

-- Progress is private: a friend sees your streak and readiness, not your checklist.
drop policy if exists roadmap_progress_owner on public.roadmap_progress;
create policy roadmap_progress_owner on public.roadmap_progress
    for all to authenticated
    using (user_id = auth.uid())
    with check (user_id = auth.uid() and public.is_approved());
