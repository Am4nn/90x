-- ===========================================================================
-- XP
-- One row per thing that earned points: a new problem solved, a review done, a
-- topic studied, a correct Feed card, the bonus for finishing a day. The app
-- sums them for "today's XP", the Me total and the 7-day chart; nothing else is
-- stored, so a rule change is a back-fill away.
--
--   kind  problem | review | topic | card | card_ai | bonus
--         card_ai is a card graded by the model (written answers): worth less
--         and capped per day, because the model can be talked into a grade.
--   ref   what earned it: a problem slug, a topic slug, a card id, or the day
--         for the bonus.
--   day   the reader's local day (profiles.timezone), not the UTC date.
--
-- unique (user_id, kind, ref, day) is what makes an award idempotent: the same
-- thing cannot earn twice on one day, however many times the code path runs.
-- The two partial indexes say "once, ever": a problem earns its new-problem XP
-- once, and a topic its studied XP once.
--
-- Server written. The app inserts and deletes over the server connection (which
-- bypasses RLS) and enforces the daily caps in the same transaction. The API
-- roles may only read their own rows: approved owners, nobody else.
--
-- Purely additive: the app tolerates the table being empty.
-- ===========================================================================
create table public.xp_events (
    id         uuid primary key default gen_random_uuid(),
    user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
    day        date not null,
    kind       text not null check (kind in ('problem', 'review', 'topic', 'card', 'card_ai', 'bonus')),
    ref        text not null,
    xp         integer not null check (xp > 0),
    created_at timestamptz not null default now(),
    unique (user_id, kind, ref, day)
);

create index xp_events_user_day_idx on public.xp_events (user_id, day);
create unique index xp_events_once_problem_idx on public.xp_events (user_id, ref) where kind = 'problem';
create unique index xp_events_once_topic_idx on public.xp_events (user_id, ref) where kind = 'topic';

alter table public.xp_events enable row level security;

-- Owner: read their own points (approved users only). No write policy at all.
create policy xp_events_owner_read on public.xp_events for select to authenticated
  using (user_id = auth.uid() and public.is_approved());

-- Belt and braces, as for friendships: a client write fails on a privilege it
-- does not hold before RLS is even consulted.
revoke all on public.xp_events from anon;
revoke insert, update, delete on public.xp_events from authenticated;
