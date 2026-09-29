-- How much practice someone has had before 90x.
--
-- The Plan page and Set up ask for it, and the planner uses it two ways: it
-- shifts the slot mix (more review and topics for someone starting out, more new
-- problems for someone interview-ready) and it biases which problem comes next by
-- difficulty. Both are preferences, never filters - a level must never leave a day
-- with nothing to work on.
--
-- Nullable on purpose, and null is not a fourth level: it means nobody asked. Every
-- account that exists today is null, and the rules read null as "behave exactly as
-- the app behaved before this column", which is the property that makes adding it
-- safe. Backfilling a guess would put people on a plan they never chose.
--
-- Grants: profiles had `select` revoked from `authenticated` in
-- 20260929000020_profiles_columns.sql, with only (user_id, name, avatar_url) granted
-- back, because a friend can read your profiles row under RLS. Adding a column
-- therefore grants no new read, which is what we want - your level is yours.
-- `update` on profiles was never revoked, so it is table-wide and covers this column,
-- which is how setup writes it: saveSetup updates through the Supabase client with no
-- `.select()`, so it needs the write and not the read.
--
-- The app itself reads it over the server connection (Drizzle), which bypasses RLS
-- and column grants. Run `bun run db:pull` after this to regenerate the schema.

alter table public.profiles
  add column if not exists level text
    check (level in ('first_time', 'some_practice', 'ready'));

comment on column public.profiles.level is
  'Self-reported experience before 90x: first_time, some_practice, ready. Null means never asked; the planner treats null as its pre-level behaviour.';
