-- ===========================================================================
-- CLOSE THE DATA API
-- Nobody without the backend reaches an app table. The publishable key in
-- every browser bundle now reaches Supabase Auth and nothing else: anon and
-- authenticated (the roles PostgREST and GraphQL run a browser request as)
-- lose every privilege in schema public, USAGE on the schema itself included.
-- The app reads and writes only over the server's own Postgres connection
-- (Drizzle, as postgres) and, in tests and admin tooling, as service_role.
-- The last client calls (the proxy's approval lookup, the admin approval
-- decision, setMinutes, the Google profile fill, the check-in push text) moved
-- to Drizzle with this migration, so 041's three column grants go too.
--
--   anon, authenticated   nothing on any table, view, sequence, function or
--                         procedure in public, no USAGE on the schema, and
--                         no default privileges on what migrations add later
--                         (041 still gave authenticated SELECT on new tables)
--   PUBLIC                loses USAGE on the schema and EXECUTE on functions
--                         (otherwise anon and authenticated would keep both
--                         through it)
--   service_role,         untouched: they keep their explicit grants
--   postgres
--   job_recorder          untouched: it has its own explicit USAGE on the
--                         schema, INSERT on seven job_runs columns and USAGE
--                         on job_runs_id_seq (040), none of them via PUBLIC.
--                         Its insert calls no public function
--
-- The row policies stay, and row security stays on, as a backstop: if a grant
-- ever comes back by mistake, the policies still decide which rows.
--
-- Supabase internals: handle_new_user (the auth.users trigger) is SECURITY
-- DEFINER, owned by postgres, and a trigger firing checks neither EXECUTE nor
-- schema USAGE, so a new sign-up still gets its profile and approval rows.
-- The app uses no Storage, Realtime or Edge Functions on public.
--
-- Not ours to change: citext lives in public and its functions are owned by
-- supabase_admin, which granted EXECUTE on them to anon and authenticated (as
-- do supabase_admin's own default privileges in public). postgres cannot
-- revoke a grant it did not make, so those REVOKEs only warn. Without USAGE
-- on the schema neither role can name them, and check-rls asserts that.
--
-- Order: after 041. Applies the same on production (after 041) and on a fresh
-- database (supabase db reset in CI). Re-runnable. A REVOKE the migration role
-- is not entitled to make only warns, so the block at the end checks the
-- result and fails (rolling all of this back) if anything is still open.
--
-- Code first, and rolling back: the app stopped using the Data API in commit
-- f79c000. A build from before it, run against this database, fails without
-- any error showing: the old proxy reads no approval row, so admins get a 404
-- on /admin and are shut out by maintenance mode; the old approval decision
-- always fails; setMinutes drops every write. To roll the app back past
-- f79c000, first put back what 041 left (SECURITY.md has the same list):
--
--   grant usage on schema public to anon, authenticated;
--   grant select on all tables in schema public to authenticated;
--   revoke select on public.profiles, public.lessons, public.app_settings,
--       public.problem_reports, public.job_runs from authenticated;
--   grant select (user_id, name, avatar_url) on public.profiles to authenticated;
--   grant select (topic_slug, title, summary, body_md, practice, source_refs,
--       words, generated_at, created_at) on public.lessons to authenticated;
--   grant update (minutes) on public.checkins to authenticated;
--   grant update (name, avatar_url) on public.profiles to authenticated;
--   grant update (status, decided_at, decided_by) on public.user_approvals to authenticated;
--   grant execute on function public.is_admin(), public.is_approved(),
--       public.is_friend(uuid), public.current_user_email() to authenticated;
--
-- Locks: GRANT and REVOKE take no table lock but do update each object's
-- catalog row, so a concurrent uncommitted DDL would make this wait.
-- lock_timeout makes it give up after 5 s instead; re-run it then.
-- ===========================================================================

set local lock_timeout = '5s';

-- Tables, views, materialized views and foreign tables. A table-level REVOKE ALL
-- also takes back every column grant (041's UPDATE columns, the SELECT columns on
-- profiles and lessons).
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from public, anon, authenticated;
-- Functions and procedures: the SECURITY DEFINER helpers the policies call
-- (is_admin, is_approved, is_friend, current_user_email) go too. The policies
-- only ever ran as authenticated, which can no longer reach a table, and
-- service_role keeps its own EXECUTE.
revoke all on all routines in schema public from public, anon, authenticated;

-- The schema itself: without USAGE nothing in it can even be named.
revoke all on schema public from public, anon, authenticated;

-- What migrations create from now on (they run as postgres) starts closed too.
alter default privileges for role postgres in schema public
    revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres in schema public
    revoke all on sequences from public, anon, authenticated;
alter default privileges for role postgres in schema public
    revoke all on routines from public, anon, authenticated;

-- Postcondition. Fails the migration if a revoke above was a silent no-op (the
-- schema or a relation owned by a role postgres cannot speak for), or if a
-- role the server and the backup workflow depend on lost the schema.
do $$
begin
    if has_schema_privilege('anon', 'public', 'USAGE')
       or has_schema_privilege('authenticated', 'public', 'USAGE')
       or exists (select 1 from pg_namespace n, aclexplode(n.nspacl) a
                  where n.nspname = 'public' and a.grantee = 0) then
        raise exception '042: anon, authenticated or PUBLIC still has USAGE on schema public';
    end if;
    if not has_schema_privilege('service_role', 'public', 'USAGE')
       or not has_schema_privilege('postgres', 'public', 'USAGE')
       or not has_schema_privilege('job_recorder', 'public', 'USAGE') then
        raise exception '042: service_role, postgres or job_recorder lost USAGE on schema public';
    end if;
    if exists (
        select 1 from pg_class c cross join (values ('anon'), ('authenticated')) as r (role)
        where c.relnamespace = 'public'::regnamespace and (
            (c.relkind in ('r', 'p', 'v', 'm', 'f')
             and (has_table_privilege(r.role, c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
                  or has_any_column_privilege(r.role, c.oid, 'SELECT, INSERT, UPDATE, REFERENCES')))
            or (c.relkind = 'S' and has_sequence_privilege(r.role, c.oid, 'USAGE, SELECT, UPDATE')))) then
        raise exception '042: a table, view, column or sequence in public still grants anon or authenticated';
    end if;
end
$$;
