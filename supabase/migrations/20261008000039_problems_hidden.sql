-- ===========================================================================
-- PROBLEMS.HIDDEN: a problem the catalog dropped but someone's history still holds.
--
-- Since 20261008000038_db_review_fixes, check-ins, review ladders, solution reviews
-- and card answers hold their problem with ON DELETE RESTRICT, so a problem the
-- catalog drops is spared when anyone has history on it. Spared alone, it stayed in
-- the Library, its search, the pattern map and Today's picks as if the catalog still
-- listed it. Such a problem now has `hidden = true` (and every listed problem
-- `hidden = false`, so one that comes back reappears).
--
-- The app treats it like a hidden card: it is never offered again (Library list,
-- search, lesson practice lists, Today and Coach picks, new Feed cards), while the
-- history that holds it keeps working: the problem page, check-ins, due reviews.
--
-- No index: almost every row is false, so a filter on it never narrows a scan;
-- the kind/pattern indexes stay the access path.
--
-- Writes: problems has RLS with a select policy only, so anon and authenticated
-- could never write it, `hidden` included. The table-wide write grants Supabase
-- gives by default are revoked as well, so that does not rest on RLS alone
-- (nothing in the app writes problems through the API; the app server connects as
-- the table owner).
--
-- Locks: adding a column with a constant default only changes the catalog (no table
-- rewrite), but it still takes ACCESS EXCLUSIVE on problems. lock_timeout makes it give
-- up after 5 s instead of queueing behind a long Library or Feed read, which would stall
-- every later query on problems behind it; re-run it then.
-- ===========================================================================

set local lock_timeout = '5s';

alter table public.problems add column if not exists hidden boolean not null default false;

comment on column public.problems.hidden is
  'Dropped from the catalog but kept for learning history. Not offered anywhere; history still opens it.';

revoke insert, update, delete, truncate on public.problems from anon, authenticated;
