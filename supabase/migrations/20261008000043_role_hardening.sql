-- ===========================================================================
-- ROLE HARDENING
-- The rest of the job_recorder lockdown (040), from the data-isolation review.
-- job_recorder is the insert-only login the nightly backup workflow uses to
-- add one job_runs row; its password lives in one repo secret. If that secret
-- leaked, this narrows what the login could still do with the access it has.
--
--   statement_timeout  5 s as the DEFAULT for every job_recorder session. It
--                      is only a default: a session can raise it with SET
--                      (the backup workflow itself sets 15 s), and Postgres
--                      has no way to stop a role changing its own setting
--   connection limit   2: one for the workflow, one spare for a retry. This,
--                      not the timeout, is the hard bound on a leaked login
--   TEMP               any direct grant of TEMPORARY on this database is
--                      revoked (by name of the current database, so the file
--                      works on prod, a fresh CI reset and locally alike).
--                      Note: TEMP also reaches every role through PUBLIC
--                      (the database default), which this does not change:
--                      taking it from PUBLIC would take it from every
--                      Supabase-managed role too, and would need re-granting
--                      to each by name. With the timeout and the connection
--                      limit, a temp table is all a leaked login could add
--   pg_stat_statements any direct grant on extensions.pg_stat_statements and
--                      pg_stat_statements_info is revoked, and so is USAGE on
--                      schema extensions. The SELECT that remains comes from
--                      supabase_admin's grant to PUBLIC, which postgres
--                      cannot revoke; without USAGE on the schema the
--                      recorder cannot name either view, and check-rls
--                      asserts that. (A role without pg_read_all_stats sees
--                      only its own statements' text there anyway.)
--
-- Not changed, because postgres may not: supabase_admin's default privileges
-- in public still grant anon, authenticated, postgres and service_role on
-- the tables, sequences and functions supabase_admin creates there (citext,
-- extension objects). ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin needs
-- membership in supabase_admin; as postgres it fails with "permission denied
-- to change default privileges" (tried on the local stack). It stays inert
-- while anon and authenticated have no USAGE on schema public (042), which
-- check-rls asserts.
--
-- Order: needs the job_recorder role from 040 and runs after 041 and 042 on
-- prod and on a fresh reset. Idempotent: every statement can run again.
-- No begin/commit: the migration runner wraps the file in a transaction.
-- ===========================================================================

set local lock_timeout = '5s';

alter role job_recorder set statement_timeout = '5s';
alter role job_recorder connection limit 2;

do $$
begin
    execute format('revoke temporary on database %I from job_recorder', current_database());
end
$$;

revoke usage on schema extensions from job_recorder;

do $$
begin
    if to_regclass('extensions.pg_stat_statements') is not null then
        revoke all on extensions.pg_stat_statements from job_recorder;
    end if;
    if to_regclass('extensions.pg_stat_statements_info') is not null then
        revoke all on extensions.pg_stat_statements_info from job_recorder;
    end if;
end
$$;

-- Postcondition: fail the migration rather than leave the recorder half-hardened.
do $$
declare
    r pg_roles%rowtype;
begin
    select * into r from pg_roles where rolname = 'job_recorder';
    if not found then
        raise exception '043: role job_recorder is missing; apply 040 first';
    end if;
    if r.rolconnlimit <> 2 then
        raise exception '043: job_recorder connection limit is %, expected 2', r.rolconnlimit;
    end if;
    if not exists (
        select 1 from pg_db_role_setting s
        where s.setrole = r.oid and s.setdatabase = 0 and 'statement_timeout=5s' = any (s.setconfig)) then
        raise exception '043: job_recorder has no 5 s statement_timeout default';
    end if;
    if exists (
        select 1 from pg_database d, aclexplode(d.datacl) a
        where d.datname = current_database() and a.grantee = r.oid and a.privilege_type = 'TEMPORARY') then
        raise exception '043: job_recorder still holds a direct TEMP grant on the database';
    end if;
    if has_schema_privilege('job_recorder', 'extensions', 'USAGE') then
        raise exception '043: job_recorder can still use schema extensions';
    end if;
end
$$;
