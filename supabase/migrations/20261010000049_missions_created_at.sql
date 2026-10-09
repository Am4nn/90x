-- ===========================================================================
-- MISSIONS.CREATED_AT: when a mission row was written.
--
-- Today's Extras list shows the newest first; the day an extra was added is not enough
-- to order several added the same day, and ids are random. Existing rows take the time
-- of this migration, which only affects their order within one day.
-- Locks: `now()` is stable within a statement, so Postgres 11+ adds the column without a rewrite.
-- Grants on missions are unchanged (nothing is granted to anon or authenticated).
-- ===========================================================================
alter table public.missions
    add column if not exists created_at timestamptz not null default now();
