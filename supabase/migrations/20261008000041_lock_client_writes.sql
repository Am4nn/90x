-- ===========================================================================
-- CLIENTS READ; THE SERVER WRITES
-- Every public table still carried Supabase's default GRANT ALL to anon and
-- authenticated, and most user tables have an owner FOR ALL policy, so a
-- signed-in user could insert or update their own rows straight through the
-- Data API with the publishable key and their session: forged coach history,
-- Feed answers past the rate limit, progress friends read, profile fields
-- the server sets. The app writes almost everything over the server (Drizzle)
-- connection, so the API roles lose INSERT/UPDATE/DELETE everywhere and get
-- back exactly the writes the app still makes through the RLS client:
--
--   checkins        UPDATE (minutes)        app/actions/sync.ts, setMinutes
--   profiles        UPDATE (name, avatar_url)
--                                           auth/callback (filled from Google)
--   user_approvals  UPDATE (status, decided_at, decided_by)
--                   admin/users/actions.ts (policy: admins only)
--
-- The manual check-in (checkins + checkin_notes) and Set up (profiles) write
-- over the server connection, scoped to the verified viewer.
--
-- The row policies stay as they are and still decide which rows. Column-level
-- grants mean nobody sets anything else on those tables from the API. SELECT
-- for authenticated is untouched (the policies and the column grants on
-- profiles and lessons decide it). anon has no policy anywhere and the app
-- never reads as anon, so it loses every table privilege: a leaked
-- publishable key reads nothing.
--
-- Order: after 039 (its revoke on problems is a subset of this one) and 040
-- (job_recorder is not touched here: only anon and authenticated lose
-- privileges, and only authenticated and service_role are granted any).
--
-- Locks: GRANT and REVOKE take no table lock but do update each table's
-- catalog row, so a concurrent uncommitted DDL would make this wait.
-- lock_timeout makes it give up after 5 s instead; re-run it then.
-- ===========================================================================

set local lock_timeout = '5s';

-- anon: nothing on any table, view or sequence.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- authenticated: no writes. SELECT is kept on purpose (revoking it at table
-- level would also drop the column grants on profiles and lessons). TRUNCATE
-- ignores row security, so it goes too, with REFERENCES, TRIGGER and MAINTAIN.
revoke insert, update, delete, truncate, references, trigger, maintain
    on all tables in schema public from authenticated;
revoke all on all sequences in schema public from authenticated;

-- The writes the app really makes as the signed-in user.
grant update (minutes) on public.checkins to authenticated;
grant update (name, avatar_url) on public.profiles to authenticated;
grant update (status, decided_at, decided_by) on public.user_approvals to authenticated;

-- Tables, sequences and functions the migrations create from now on (they run
-- as postgres) start the same way: anon gets nothing, authenticated may only
-- read tables, and nobody but the owner runs a new function until a migration
-- grants it. A new table that needs a client write grants it explicitly.
alter default privileges for role postgres in schema public
    revoke all on tables from anon;
alter default privileges for role postgres in schema public
    revoke insert, update, delete, truncate, references, trigger, maintain on tables from authenticated;
alter default privileges for role postgres in schema public
    revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
    revoke execute on functions from public, anon;
-- PUBLIC's EXECUTE on new functions is a global default, and a per-schema
-- ALTER DEFAULT PRIVILEGES cannot take away a global one: the line above
-- leaves it in place. This takes it away for every function postgres creates,
-- in any schema. Inside public, authenticated and service_role still get
-- EXECUTE from the schema default; elsewhere a function is the owner's until
-- a migration grants it (a trigger firing does not check EXECUTE).
alter default privileges for role postgres
    revoke execute on functions from public;

-- The SECURITY DEFINER helpers answer about auth.uid(), so anon only ever got
-- false or null back, but there is no reason to let it call them over RPC.
-- The policies run as authenticated, and the server as service_role/postgres.
-- Written to be right whether or not 040 (which moved EXECUTE from PUBLIC to
-- the API roles) has run: take it from PUBLIC and anon, give it to the two
-- roles that need it. handle_new_user is a trigger function: a trigger firing
-- does not check EXECUTE and calling it directly fails, so nobody is granted it.
revoke execute on function public.is_admin(), public.is_approved(), public.is_friend(uuid),
    public.current_user_email(), public.handle_new_user() from public, anon;
grant execute on function public.is_admin(), public.is_approved(), public.is_friend(uuid),
    public.current_user_email() to authenticated, service_role;
