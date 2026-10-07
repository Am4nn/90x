-- ===========================================================================
-- JOB RECORDER ROLE
-- An insert-only login for the nightly backup workflow (.github/workflows/
-- db-backup.yml). Its last step writes one public.job_runs row per run; until
-- now it did that with the full-privilege PROD_DB_URL. With this role the
-- JOB_RUNS_DB_URL secret can add a 'db-backup' row to job_runs and nothing
-- else: it cannot read, change or delete any row, nor touch any other table.
--
--   role         job_recorder: LOGIN, NOINHERIT, no CREATEDB / CREATEROLE /
--                BYPASSRLS, and a member of no other role
--   table        INSERT on the seven columns the workflow writes; id comes
--                from its default, hence USAGE on job_runs_id_seq
--   row security one INSERT policy: only job = 'db-backup', status ok or
--                failed, and a small result. No SELECT grant or policy, so
--                the workflow's insert has no RETURNING
--   functions    PUBLIC loses EXECUTE on the SECURITY DEFINER functions in
--                public (current_user_email, is_admin, is_approved,
--                is_friend, handle_new_user). They read auth.uid() from the
--                request.jwt.claims setting, which a direct SQL login can set
--                to any user id, so a leaked JOB_RUNS_DB_URL could read any
--                user's email through them. anon, authenticated and
--                service_role keep EXECUTE by explicit grant (they already
--                had one; the policies and RPCs run as those roles), and a
--                trigger firing does not check EXECUTE.
--
-- No password here: it is set on production by hand and kept only in the
-- JOB_RUNS_DB_URL repo secret (BACKUPS.md has the steps and the rotation).
-- A role without a password cannot sign in, so applying this is harmless on
-- its own.
--
-- Idempotent: safe to run again. Purely additive for the app.
-- ===========================================================================

do $$
declare
    r pg_roles%rowtype;
begin
    select * into r from pg_roles where rolname = 'job_recorder';
    if not found then
        create role job_recorder with login noinherit nocreatedb nocreaterole nobypassrls;
    elsif r.rolsuper or r.rolcreatedb or r.rolcreaterole or r.rolbypassrls or r.rolreplication or r.rolinherit
        or exists (select 1 from pg_auth_members where member = r.oid) then
        -- Not altered here: on Supabase the migration role may not change these attributes. Stop instead.
        raise exception 'role job_recorder exists with more than insert-only attributes; fix it by hand';
    end if;
end
$$;

-- Defensive: whatever it may have been given before, start from nothing in public.
revoke all on schema public from job_recorder;
revoke all on all tables in schema public from job_recorder;
revoke all on all sequences in schema public from job_recorder;

grant usage on schema public to job_recorder;
grant insert (job, started_at, finished_at, status, duration_ms, result, error) on public.job_runs to job_recorder;
grant usage on sequence public.job_runs_id_seq to job_recorder;

-- job_runs has row security on and, until now, no policy at all. This one lets the recorder add a backup
-- run and nothing else; the API roles still have no policy and no grant. The workflow writes only ok or
-- failed, and a result of about 80 bytes ({"bytes": N, "key": "90x/....dump.gpg"}); the app's own 2 KB cap
-- does not apply to a direct login, so the policy holds it. error is capped by the table.
drop policy if exists "job_recorder adds backup runs" on public.job_runs;
create policy "job_recorder adds backup runs" on public.job_runs
    for insert to job_recorder
    with check (job = 'db-backup' and status in ('ok', 'failed') and octet_length(result::text) <= 2048);

-- Every SECURITY DEFINER function in public that PUBLIC may run: keep it for the API roles, take it from
-- everyone else (job_recorder included). A loop rather than a list, so one made outside the migrations is
-- covered too. check-rls asserts job_recorder can run none of them.
do $$
declare
    f regprocedure;
begin
    for f in
        select p.oid::regprocedure
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.prosecdef
          and p.proowner = current_user::regrole
          and exists (
              select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
              where a.grantee = 0 and a.privilege_type = 'EXECUTE')
    loop
        execute format('grant execute on function %s to anon, authenticated, service_role', f);
        execute format('revoke execute on function %s from public', f);
    end loop;
end
$$;
