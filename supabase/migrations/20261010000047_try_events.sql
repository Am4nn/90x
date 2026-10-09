-- ===========================================================================
-- TRY_EVENTS: what visitors do on /try, the public no-sign-in page.
--
-- Anonymous: a random visit id made in the browser's memory for one page load (never a
-- cookie), the event kind and a few small fields. No user id, no IP, no user agent.
-- Read by admin Analytics ("The demo"). Written only by the app server through
-- POST /api/try/event (rate-limited); no client grants (042 closed the Data API).
-- Locks: a new table takes no lock anyone waits on.
-- ===========================================================================
create table public.try_events (
    id         bigserial primary key,
    visit      text not null check (visit ~ '^[a-z0-9]{16,32}$'),
    kind       text not null check (kind in ('view','tab','answer','listen_start','listen_95','listen_pause','signin_click','leave')),
    data       jsonb not null default '{}' check (pg_column_size(data) <= 512),
    created_at timestamptz not null default now()
);
create index try_events_created_idx on public.try_events (created_at);
create index try_events_visit_idx on public.try_events (visit);
alter table public.try_events enable row level security;
revoke all on public.try_events from anon, authenticated;
revoke all on sequence public.try_events_id_seq from anon, authenticated;
