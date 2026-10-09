-- ===========================================================================
-- PROFILES.TIPS_SEEN: the demo steps an account has seen.
--
-- After the first-run welcome, Today runs a short demo of tips that point at real
-- controls (plan + me, then audio), each shown once per account. The ids of the steps
-- seen live here, on the profile, so a tip doesn't come back on another device. A new
-- feature adds a step id; existing ids are never reused.
--
-- Grants: none. The browser reaches no app table (042); only the app server writes it.
-- Locks: a column with a constant default only changes the catalog (no rewrite), but it
-- takes ACCESS EXCLUSIVE on profiles; lock_timeout gives up after 5 s instead of queueing
-- every sign-in behind it.
-- ===========================================================================

set local lock_timeout = '5s';

alter table public.profiles add column if not exists tips_seen text[] not null default '{}';
