-- ===========================================================================
-- PROFILES.WELCOME_SEEN_AT: when someone finished or skipped the first-run welcome.
--
-- The welcome is the two-page overlay Today shows once, after Set up: how a day's
-- missions are picked, then the 90 squares and "Hold: I'm in". It is stored on the
-- profile rather than in the browser, so it does not come back on another device.
-- Null means not seen yet; the app sets it once and never clears it.
--
-- Grants: none. The browser reaches no app table (042); only the app server writes
-- this, connecting as the table owner. authenticated keeps exactly its column grants
-- on profiles (select user_id, name, avatar_url; update name, avatar_url).
--
-- Locks: a nullable column with no default only changes the catalog (no rewrite),
-- but it still takes ACCESS EXCLUSIVE on profiles. lock_timeout makes it give up
-- after 5 s instead of queueing every sign-in behind it; re-run it then.
-- ===========================================================================

set local lock_timeout = '5s';

alter table public.profiles add column if not exists welcome_seen_at timestamptz;
