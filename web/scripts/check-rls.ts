// Checks the database's access rules against the real database.
// Everything runs inside one transaction that is always rolled back, so it
// leaves no rows behind. Run with `bun run check:rls`.
//
// In order: the Data API is closed (anon and authenticated hold nothing in
// public, migration 042), job_recorder adds backup runs and nothing else
// (040) within the limits 043 sets, and then the row policies, the backstop, against the grants 041
// left (put back for this transaction only), so they keep being proven.

import postgres from "postgres";

const url = process.env.DIRECT_URL;
if (!url) {
  console.error("DIRECT_URL is not set. See .env.example.");
  process.exit(1);
}

const sql = postgres(url, { prepare: false, max: 1 });

type Tx = postgres.TransactionSql;

const failures: string[] = [];
function expect(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures.push(name);
}

// Run `fn` as a signed-in user, then return to the owner role.
async function as<T>(tx: Tx, userId: string | null, fn: () => Promise<T>): Promise<T> {
  if (userId) {
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: "authenticated" })}, true)`;
    await tx`set local role authenticated`;
  } else {
    await tx`select set_config('request.jwt.claims', '{"role":"anon"}', true)`;
    await tx`set local role anon`;
  }
  try {
    return await fn();
  } finally {
    await tx`reset role`;
  }
}

// The one row a query must return (an insert ... returning, a count).
function one<T>(rows: readonly T[]): T {
  const row = rows[0];
  if (!row) throw new Error("expected a row");
  return row;
}

// One statement as a user, inside a savepoint so a refusal does not end the transaction:
// the rows it returned, or "denied" when the database refused it on privilege (42501
// insufficient_privilege, which a row-policy violation raises too). Any other error (a
// foreign key, a check constraint, a typo in the fixture) is rethrown, so a broken
// fixture fails the run instead of passing every "cannot" check.
async function attempt(tx: Tx, userId: string | null, fn: (sp: Tx) => Promise<readonly unknown[]>): Promise<readonly unknown[] | "denied"> {
  return as(tx, userId, async () => {
    try {
      return (await tx.savepoint((sp) => fn(sp))) as readonly unknown[];
    } catch (e) {
      if ((e as { code?: string }).code === "42501") return "denied" as const;
      throw e;
    }
  });
}

const ROLLBACK = new Error("rollback");

try {
  await sql.begin(async (tx) => {
    // Five users: approved A, approved friend B, approved non-friend C, pending P,
    // and approved D — a friend of B but not of A, for the transitive case.
    const ids = {
      a: "00000000-0000-4000-8000-00000000000a",
      b: "00000000-0000-4000-8000-00000000000b",
      c: "00000000-0000-4000-8000-00000000000c",
      p: "00000000-0000-4000-8000-00000000000d",
      d: "00000000-0000-4000-8000-00000000000e",
    };
    for (const [key, id] of Object.entries(ids)) {
      await tx`insert into auth.users (id, email, aud, role, raw_user_meta_data)
               values (${id}, ${`rls-${key}@example.test`}, 'authenticated', 'authenticated',
                       ${tx.json({ full_name: `RLS ${key}` })})`;
    }
    const approvals = await tx`select user_id, status from public.user_approvals where user_id in ${tx(Object.values(ids))}`;
    expect("trigger creates a pending approval per new user", approvals.length === 5 && approvals.every((r) => r.status === "pending"));
    const profiles = await tx`select count(*)::int as n from public.profiles where user_id in ${tx(Object.values(ids))}`;
    expect("trigger creates a profile per new user", one(profiles).n === 5);

    await tx`update public.user_approvals set status = 'approved', decided_at = now() where user_id in ${tx([ids.a, ids.b, ids.c, ids.d])}`;
    // A–B, A–P (pending), and B–D. A and D share a friend but are not friends.
    await tx`insert into public.friendships (user_a, user_b) values (${ids.a}, ${ids.b}), (${ids.a}, ${ids.p}), (${ids.b}, ${ids.d})`;

    // Content rows to read.
    await tx`insert into public.sources (id, name, domain, role) values ('rls-src', 'RLS source', 'dsa', 'cards')`;
    await tx`insert into public.topics (slug, domain, name) values ('rls-topic', 'dsa', 'RLS topic')`;
    await tx`insert into public.problems (slug, kind, title, difficulty, pattern_slug, source_id)
             values ('rls-problem', 'leetcode', 'RLS problem', 'Easy', 'rls-topic', 'rls-src')`;
    const batch = one(await tx`insert into public.card_batches (domain, status) values ('dsa', 'draft') returning id`);
    await tx`insert into public.cards (batch_id, topic_slug, format, prompt_md, answer_md, status)
             values (${batch.id}, 'rls-topic', 'typed', 'draft card', 'x', 'draft'),
                    (${batch.id}, 'rls-topic', 'typed', 'live card', 'x', 'live')`;

    // ---------------------------------------------------------------------------------------------
    // The Data API is closed (042). anon and authenticated, the roles a request made with the publishable
    // key runs as, hold nothing in public: no USAGE on the schema, no privilege on any table, view,
    // column, sequence or function, and no default that would hand them one on what a migration adds
    // later. Only the server (postgres over Drizzle, service_role) touches app tables. Read from the
    // catalog, then tried for real on every table and helper, so a new table, grant or helper that
    // reopens any of it fails here, not in review.
    const schemaUse = await tx`select r.role,
        has_schema_privilege(r.role, 'public', 'USAGE') as usage,
        has_schema_privilege(r.role, 'public', 'CREATE') as create
      from (values ('anon'), ('authenticated')) as r (role)`;
    const schemaPublic = one(
      await tx`select exists (select 1 from pg_namespace n, aclexplode(n.nspacl) a
        where n.nspname = 'public' and a.grantee = 0) as public_grant`,
    );
    expect(
      "anon, authenticated and PUBLIC have no USAGE (or CREATE) on schema public",
      schemaUse.every((r) => !r.usage && !r.create) && !schemaPublic.public_grant,
      JSON.stringify({ schemaUse, ...schemaPublic }),
    );
    // Grantee 0 is PUBLIC, which anon and authenticated would inherit.
    const relationGrants = await tx`select c.relname, c.relkind,
          case when x.grantee = 0 then 'public' else x.grantee::regrole::text end as role, x.privilege_type as priv
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        cross join lateral aclexplode(c.relacl) x
        where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f', 'S')
          and (x.grantee = 0 or x.grantee in ('anon'::regrole, 'authenticated'::regrole))`;
    const columnGrants = await tx`select c.relname, a.attname,
          case when x.grantee = 0 then 'public' else x.grantee::regrole::text end as role, x.privilege_type as priv
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
        cross join lateral aclexplode(a.attacl) x
        where n.nspname = 'public' and (x.grantee = 0 or x.grantee in ('anon'::regrole, 'authenticated'::regrole))`;
    // The effective answer too (through PUBLIC or any role they were made a member of).
    const effective = await tx`select c.relname, r.role from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        cross join (values ('anon'), ('authenticated')) as r (role)
        where n.nspname = 'public' and (
          (c.relkind in ('r', 'p', 'v', 'm', 'f')
            and (has_table_privilege(r.role, c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN')
              or has_any_column_privilege(r.role, c.oid, 'SELECT, INSERT, UPDATE, REFERENCES')))
          or (c.relkind = 'S' and has_sequence_privilege(r.role, c.oid, 'USAGE, SELECT, UPDATE')))`;
    expect(
      "no table, view, column or sequence in public grants anon, authenticated or PUBLIC anything",
      relationGrants.length === 0 && columnGrants.length === 0 && effective.length === 0,
      [
        ...relationGrants.map((r) => `${r.role}:${r.relname}:${r.priv}`),
        ...columnGrants.map((r) => `${r.role}:${r.relname}.${r.attname}:${r.priv}`),
        ...effective.map((r) => `${r.role}:${r.relname}`),
      ].join(", "),
    );
    // A NULL proacl means the built-in default, which gives PUBLIC EXECUTE, hence the coalesce. Functions an
    // extension installed in public (citext) are owned by supabase_admin, whose grants to the API roles the
    // migration role cannot revoke: without USAGE on the schema (asserted above) nobody can name them, so they
    // are counted, not failed.
    const functionGrants = await tx`select p.oid::regprocedure::text as fn,
          case when x.grantee = 0 then 'public' else x.grantee::regrole::text end as role,
          exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e') as extension
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x
        where n.nspname = 'public' and (x.grantee = 0 or x.grantee in ('anon'::regrole, 'authenticated'::regrole))`;
    const ownFunctionGrants = functionGrants.filter((r) => !r.extension);
    expect(
      "no function or procedure of ours in public runs for anon, authenticated or PUBLIC",
      ownFunctionGrants.length === 0,
      ownFunctionGrants.map((r) => `${r.role}:${r.fn}`).join(", ") ||
        `extension functions reachable only through the closed schema: ${new Set(functionGrants.map((r) => r.fn)).size}`,
    );
    // The server keeps what it needs: service_role and postgres still use the schema (has_function_privilege and
    // has_table_privilege ignore schema USAGE, so it is asked on its own), and service_role still runs the helpers.
    const serverSchema = one(
      await tx`select has_schema_privilege('service_role', 'public', 'USAGE') as service_role,
        has_schema_privilege('postgres', 'public', 'USAGE') as postgres`,
    );
    const serviceHelpers = await tx`select h.fn, has_function_privilege('service_role', h.fn, 'execute') as service
        from unnest(array['public.current_user_email()', 'public.is_admin()', 'public.is_approved()', 'public.is_friend(uuid)']) as h (fn)`;
    expect(
      "service_role and postgres keep USAGE on schema public, and service_role still runs the SECURITY DEFINER helpers",
      serverSchema.service_role && serverSchema.postgres && serviceHelpers.length === 4 && serviceHelpers.every((r) => r.service),
      JSON.stringify({ ...serverSchema, serviceHelpers }),
    );
    // Defaults: per schema and global (namespace 0). Without the global function row, the built-in default would
    // give PUBLIC EXECUTE on every new function, so that row must exist.
    const defaults = await tx`select d.defaclobjtype as kind, d.defaclnamespace::regnamespace::text as schema,
          case when x.grantee = 0 then 'public' else x.grantee::regrole::text end as role, x.privilege_type as priv
        from pg_default_acl d cross join lateral aclexplode(d.defaclacl) x
        where d.defaclrole = 'postgres'::regrole and d.defaclnamespace in (0, 'public'::regnamespace)
          and (x.grantee = 0 or x.grantee in ('anon'::regrole, 'authenticated'::regrole))`;
    const globalFunctionDefault = one(
      await tx`select count(*)::int as n from pg_default_acl
        where defaclrole = 'postgres'::regrole and defaclnamespace = 0 and defaclobjtype = 'f'`,
    );
    expect(
      "default privileges give anon, authenticated and PUBLIC nothing on what migrations add later",
      defaults.length === 0 && globalFunctionDefault.n === 1,
      defaults.map((r) => `${r.role}:${r.schema}:${r.kind}:${r.priv}`).join(", ") ||
        `global function default rows: ${globalFunctionDefault.n}`,
    );
    // The catalog rows are not the whole story (a global default applies on top of the per-schema rows), so make
    // one of each, as a migration would, and read what it got.
    await tx`create function public.rls_probe_fn() returns int language sql as 'select 1'`;
    await tx`create table public.rls_probe_table (id int)`;
    await tx`create sequence public.rls_probe_seq`;
    const fresh = one(
      await tx`select
        exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                where p.oid = 'public.rls_probe_fn()'::regprocedure and a.grantee = 0) as fn_public,
        has_function_privilege('anon', 'public.rls_probe_fn()', 'execute')
          or has_function_privilege('authenticated', 'public.rls_probe_fn()', 'execute') as fn_api,
        has_table_privilege('anon', 'public.rls_probe_table', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN')
          or has_table_privilege('authenticated', 'public.rls_probe_table', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN') as table_api,
        has_sequence_privilege('anon', 'public.rls_probe_seq', 'USAGE, UPDATE, SELECT')
          or has_sequence_privilege('authenticated', 'public.rls_probe_seq', 'USAGE, UPDATE, SELECT') as seq_api,
        has_function_privilege('service_role', 'public.rls_probe_fn()', 'execute')
          and has_table_privilege('service_role', 'public.rls_probe_table', 'SELECT, INSERT') as service`,
    );
    expect(
      "a function, table and sequence made now give the API roles nothing (service_role still gets them)",
      !fresh.fn_public && !fresh.fn_api && !fresh.table_api && !fresh.seq_api && fresh.service,
      JSON.stringify(fresh),
    );
    await tx`drop function public.rls_probe_fn()`;
    await tx`drop table public.rls_probe_table`;
    await tx`drop sequence public.rls_probe_seq`;
    const noRls = await tx`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
                            where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity`;
    expect(
      "every public table still has row security on (the policies are the backstop)",
      noRls.length === 0,
      noRls.map((r) => r.relname).join(", "),
    );
    // The same door, tried: a signed-in approved user and an anonymous caller read, add and delete nothing
    // anywhere, and call no helper and no sequence. Only a permission error (42501) counts as refused.
    const relations = await tx`select c.relname, c.relkind from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f', 'S') order by c.relname`;
    const opened: string[] = [];
    for (const who of [ids.a, null]) {
      const label = who ? "authenticated" : "anon";
      for (const { relname, relkind } of relations) {
        const tries: [string, (sp: Tx) => Promise<readonly unknown[]>][] =
          relkind === "S"
            ? [["nextval", (sp) => sp`select nextval(${`public.${relname}`}::regclass)`]]
            : [
                ["select", (sp) => sp`select 1 from public.${sp(relname)} limit 1`],
                ["insert", (sp) => sp`insert into public.${sp(relname)} default values`],
                ["delete", (sp) => sp`delete from public.${sp(relname)}`],
              ];
        for (const [what, run] of tries) if ((await attempt(tx, who, run)) !== "denied") opened.push(`${label}:${what}:${relname}`);
      }
      for (const [what, run] of [
        ["is_admin", (sp: Tx) => sp`select public.is_admin()`],
        ["is_approved", (sp: Tx) => sp`select public.is_approved()`],
        ["is_friend", (sp: Tx) => sp`select public.is_friend(${ids.b})`],
        ["current_user_email", (sp: Tx) => sp`select public.current_user_email()`],
      ] as const)
        if ((await attempt(tx, who, run)) !== "denied") opened.push(`${label}:${what}`);
    }
    expect(
      `anon and a signed-in user are refused every read, insert and delete on all ${relations.length} relations in public, and every helper`,
      relations.length > 0 && opened.length === 0,
      opened.join(", "),
    );

    // Job runs are written by the scheduled jobs and read by the admin page, both over the server
    // connection. The API roles see nothing and write nothing.
    await tx`insert into public.job_runs (job, status) values ('rls-check', 'ok')`;
    const jobRunsAccess = async (viewer: string | null, statement: "select" | "insert" | "update" | "delete") =>
      as(tx, viewer, async () => {
        try {
          // No grant at all, so every statement fails on privilege before row security is consulted.
          await tx.savepoint(async (sp) => {
            if (statement === "select") await sp`select id from public.job_runs`;
            else if (statement === "insert") await sp`insert into public.job_runs (job, status) values ('x', 'ok')`;
            else if (statement === "update") await sp`update public.job_runs set status = 'failed' where job = 'rls-check'`;
            else await sp`delete from public.job_runs where job = 'rls-check'`;
          });
          return "allowed";
        } catch {
          return "blocked";
        }
      });
    const jobRunsPrivileges = one(
      await tx`select
        has_table_privilege('authenticated', 'public.job_runs', 'select') as sel,
        has_table_privilege('anon', 'public.job_runs', 'select') as anon_sel,
        has_sequence_privilege('authenticated', 'public.job_runs_id_seq', 'usage') as seq,
        has_sequence_privilege('anon', 'public.job_runs_id_seq', 'usage') as anon_seq,
        (select relrowsecurity from pg_class where oid = 'public.job_runs'::regclass) as rls`,
    );
    expect(
      "job_runs has row security on, no API grant (table or sequence), and neither a reader nor anonymous reads, writes, updates or deletes a run",
      jobRunsPrivileges.rls === true &&
        !jobRunsPrivileges.sel &&
        !jobRunsPrivileges.anon_sel &&
        !jobRunsPrivileges.seq &&
        !jobRunsPrivileges.anon_seq &&
        (await jobRunsAccess(ids.a, "select")) === "blocked" &&
        (await jobRunsAccess(ids.a, "insert")) === "blocked" &&
        (await jobRunsAccess(ids.a, "update")) === "blocked" &&
        (await jobRunsAccess(ids.a, "delete")) === "blocked" &&
        (await jobRunsAccess(null, "select")) === "blocked" &&
        (await jobRunsAccess(null, "insert")) === "blocked",
      JSON.stringify(jobRunsPrivileges),
    );

    // job_recorder, the backup workflow's own login (migration 040): it adds a 'db-backup' run with the
    // workflow's insert and does nothing else. The owner may not become that role by default, so this
    // grants it for the transaction only (rolled back with everything else).
    await tx`grant job_recorder to current_user with set true, inherit false`;
    const asRecorder = async (run: (sp: Tx) => Promise<unknown>) => {
      try {
        await tx.savepoint(async (sp) => {
          await sp`set local role job_recorder`;
          await run(sp);
        });
        return "allowed";
      } catch {
        return "blocked";
      } finally {
        await tx`reset role`;
      }
    };
    const recorder = {
      // The same columns and values as the "Record the run" step of .github/workflows/db-backup.yml.
      workflowInsert: await asRecorder(
        (sp) => sp`insert into public.job_runs (job, started_at, finished_at, status, duration_ms, result, error)
                   values ('db-backup', now() - interval '42 seconds', now(), 'ok', 42000,
                           jsonb_build_object('bytes', 6000000, 'key', '90x/rls-check.dump.gpg'), null)`,
      ),
      returning: await asRecorder((sp) => sp`insert into public.job_runs (job, status) values ('db-backup', 'ok') returning id`),
      otherJob: await asRecorder((sp) => sp`insert into public.job_runs (job, status) values ('hourly', 'ok')`),
      otherStatus: await asRecorder((sp) => sp`insert into public.job_runs (job, status) values ('db-backup', 'running')`),
      bigResult: await asRecorder(
        (sp) =>
          sp`insert into public.job_runs (job, status, result) values ('db-backup', 'ok', jsonb_build_object('pad', repeat('x', 3000)))`,
      ),
      ownId: await asRecorder((sp) => sp`insert into public.job_runs (id, job, status) values (-1, 'db-backup', 'ok')`),
      select: await asRecorder((sp) => sp`select id from public.job_runs`),
      update: await asRecorder((sp) => sp`update public.job_runs set status = 'failed' where job = 'rls-check'`),
      delete: await asRecorder((sp) => sp`delete from public.job_runs where job = 'rls-check'`),
      profileInsert: await asRecorder((sp) => sp`insert into public.profiles (user_id) values (${ids.c})`),
      profileSelect: await asRecorder((sp) => sp`select user_id from public.profiles`),
      authSelect: await asRecorder((sp) => sp`select id from auth.users`),
      // auth.uid() reads request.jwt.claims, which a direct login can set to anyone: so no SECURITY DEFINER helper.
      emailOfAnyone: await asRecorder(async (sp) => {
        await sp`select set_config('request.jwt.claims', ${JSON.stringify({ sub: ids.a })}, true)`;
        await sp`select public.current_user_email()`;
      }),
      isAdmin: await asRecorder((sp) => sp`select public.is_admin()`),
      isApproved: await asRecorder((sp) => sp`select public.is_approved()`),
      isFriend: await asRecorder((sp) => sp`select public.is_friend(${ids.b})`),
    };
    const recorderRole = one(
      await tx`select r.rolcanlogin as login, r.rolinherit as inherit, r.rolsuper as super, r.rolcreatedb as createdb,
        r.rolcreaterole as createrole, r.rolbypassrls as bypassrls,
        exists (select 1 from pg_auth_members m where m.member = r.oid) as member_of_any,
        (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm') and c.relname <> 'job_runs'
            and (has_table_privilege(r.oid, c.oid, 'select, insert, update, delete, truncate, references, trigger')
              or has_any_column_privilege(r.oid, c.oid, 'select, insert, update, references'))) as other_tables,
        (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where p.prosecdef and has_schema_privilege(r.oid, n.oid, 'usage')
            and has_function_privilege(r.oid, p.oid, 'execute')) as secdef_functions
        from pg_roles r where r.rolname = 'job_recorder'`,
    );
    expect(
      "job_recorder (the backup workflow's login) adds an ok or failed db-backup run and nothing else: no read, update, delete, RETURNING, other job or status, big result, own id, other table, or SECURITY DEFINER function",
      recorder.workflowInsert === "allowed" &&
        Object.entries(recorder).every(([k, v]) => k === "workflowInsert" || v === "blocked") &&
        recorderRole.login === true &&
        !recorderRole.inherit &&
        !recorderRole.super &&
        !recorderRole.createdb &&
        !recorderRole.createrole &&
        !recorderRole.bypassrls &&
        !recorderRole.member_of_any &&
        recorderRole.other_tables === 0 &&
        recorderRole.secdef_functions === 0,
      JSON.stringify({ ...recorder, ...recorderRole }),
    );
    // What a leaked recorder password could still do (migration 043): at most two sessions (the hard bound),
    // a 5 s statement_timeout as their default (only a default: a session can SET it higher, as the backup
    // workflow does), no direct TEMP grant, and no way to name pg_stat_statements. TEMP through PUBLIC (the
    // database default) is not asserted away: 043 explains why it stays.
    const recorderLimits = one(
      await tx`select r.rolconnlimit as connlimit,
        exists (select 1 from pg_db_role_setting s where s.setrole = r.oid and s.setdatabase = 0
          and 'statement_timeout=5s' = any (s.setconfig)) as timeout,
        exists (select 1 from pg_database d, aclexplode(d.datacl) a
          where d.datname = current_database() and a.grantee = r.oid and a.privilege_type = 'TEMPORARY') as direct_temp,
        has_schema_privilege(r.oid, 'extensions', 'usage') as extensions_usage,
        exists (select 1 from pg_class c, aclexplode(c.relacl) a
          where c.relnamespace = 'extensions'::regnamespace and c.relname like 'pg_stat_statements%'
            and a.grantee = r.oid) as direct_stat_grant
        from pg_roles r where r.rolname = 'job_recorder'`,
    );
    const statStatements = await asRecorder((sp) => sp`select count(*) from extensions.pg_stat_statements`);
    expect(
      "job_recorder has at most 2 sessions, which default to 5 s statements, with no direct TEMP grant and no access to pg_stat_statements",
      recorderLimits.connlimit === 2 &&
        recorderLimits.timeout === true &&
        !recorderLimits.direct_temp &&
        !recorderLimits.extensions_usage &&
        !recorderLimits.direct_stat_grant &&
        statStatements === "blocked",
      JSON.stringify({ ...recorderLimits, statStatements }),
    );
    // supabase_admin's default privileges in public still name anon and authenticated (postgres may not
    // change them, 043). They stay inert only while neither role can use the schema at all.
    const apiSchemaUsage = one(
      await tx`select has_schema_privilege('anon', 'public', 'usage') as anon, has_schema_privilege('authenticated', 'public', 'usage') as authenticated`,
    );
    expect(
      "supabase_admin's default grants in public stay inert: anon and authenticated cannot use the schema",
      !apiSchemaUsage.anon && !apiSchemaUsage.authenticated,
      JSON.stringify(apiSchemaUsage),
    );
    // ---------------------------------------------------------------------------------------------
    // The backstop. Row security stays on and the policies stay in place, so that a grant that ever comes
    // back by mistake still meets them. To keep proving that, put back (for this rolled-back transaction
    // only) exactly what 041 left the API roles: USAGE on the schema, authenticated's reads (column-limited
    // on profiles and lessons; none on app_settings, problem_reports, job_runs), its three column writes and
    // the helpers the policies call. Everything below runs against that state, never the real one.
    await tx`grant usage on schema public to anon, authenticated`;
    await tx`grant select on all tables in schema public to authenticated`;
    await tx`revoke select on public.profiles, public.lessons, public.app_settings, public.problem_reports, public.job_runs
             from authenticated`;
    await tx`grant select (user_id, name, avatar_url) on public.profiles to authenticated`;
    await tx`grant select (topic_slug, title, summary, body_md, practice, source_refs, words, generated_at, created_at)
             on public.lessons to authenticated`;
    await tx`grant update (minutes) on public.checkins to authenticated`;
    await tx`grant update (name, avatar_url) on public.profiles to authenticated`;
    await tx`grant update (status, decided_at, decided_by) on public.user_approvals to authenticated`;
    await tx`grant execute on function public.is_admin(), public.is_approved(), public.is_friend(uuid), public.current_user_email()
             to authenticated`;

    // Content visibility.
    const anonProblems = await attempt(tx, null, (sp) => sp`select slug from public.problems where slug = 'rls-problem'`);
    expect("anonymous user cannot read problems at all (no grant)", anonProblems === "denied");
    const pendingProblems = await as(tx, ids.p, () => tx`select slug from public.problems where slug = 'rls-problem'`);
    expect("pending user reads no problems", pendingProblems.length === 0);
    const approvedProblems = await as(tx, ids.a, () => tx`select slug from public.problems where slug = 'rls-problem'`);
    expect("approved user reads problems", approvedProblems.length === 1);
    const approvedCards = await as(tx, ids.a, () => tx`select prompt_md from public.cards where topic_slug = 'rls-topic'`);
    expect("approved non-admin sees only live cards", approvedCards.length === 1 && approvedCards[0]?.prompt_md === "live card");
    const writeContent = await as(tx, ids.a, async () => {
      try {
        await tx.savepoint(async (sp) => {
          await sp`insert into public.topics (slug, domain, name) values ('rls-hack', 'dsa', 'x')`;
        });
        return "allowed";
      } catch {
        return "blocked";
      }
    });
    expect("approved user cannot write content", writeContent === "blocked");
    // problems.hidden is catalog data (a problem kept only for history): no API role sets it.
    for (const [who, id] of [
      ["anonymous user", null],
      ["approved user", ids.a],
    ] as const) {
      const hide = await as(tx, id, async () => {
        try {
          const rows = await tx.savepoint((sp) => sp`update public.problems set hidden = true where slug = 'rls-problem' returning slug`);
          return rows.length ? "allowed" : "blocked";
        } catch {
          return "blocked";
        }
      });
      expect(`${who} cannot hide a problem`, hide === "blocked");
    }
    // RLS alone already blocks those writes, so check the grant too (migration 039 revokes it).
    const [problemGrants] = await tx`select
      has_table_privilege('anon', 'public.problems', 'INSERT, UPDATE, DELETE, TRUNCATE') as anon,
      has_table_privilege('authenticated', 'public.problems', 'INSERT, UPDATE, DELETE, TRUNCATE') as authed`;
    expect(
      "the API roles hold no write grant on problems",
      problemGrants?.anon === false && problemGrants?.authed === false,
      JSON.stringify(problemGrants),
    );
    const [stillListed] = await tx`select hidden from public.problems where slug = 'rls-problem'`;
    expect("the problem is still listed", stillListed?.hidden === false);

    // Check-ins: friends read rows directly; the note lives in checkin_notes, owner-only.
    // Written as the owner, as the server does since 041: the API roles cannot insert either table.
    const checkin = one(
      await tx`insert into public.checkins (user_id, problem_slug, result, minutes)
               values (${ids.a}, 'rls-problem', 'solved', 30) returning id`,
    );
    await tx`insert into public.checkin_notes (checkin_id, user_id, note) values (${checkin.id}, ${ids.a}, 'private note')`;
    const ownNote = await as(tx, ids.a, () => tx`select note from public.checkin_notes where checkin_id = ${checkin.id}`);
    expect("owner reads own check-in note", ownNote.length === 1 && ownNote[0]?.note === "private note");
    const friendRows = await as(tx, ids.b, () => tx`select * from public.checkins where user_id = ${ids.a}`);
    expect("approved friend reads the check-in", friendRows.length === 1);
    expect("checkins has no note column", friendRows.length === 1 && !("note" in one(friendRows)));
    const nonFriendRows = await as(tx, ids.c, () => tx`select * from public.checkins where user_id = ${ids.a}`);
    expect("approved non-friend reads no check-ins", nonFriendRows.length === 0);
    const friendNote = await as(tx, ids.b, () => tx`select note from public.checkin_notes where checkin_id = ${checkin.id}`);
    expect("friend cannot read the note", friendNote.length === 0);
    const pendingRows = await as(tx, ids.p, () => tx`select * from public.checkins where user_id = ${ids.a}`);
    expect("pending user reads no check-ins even with a friendship row", pendingRows.length === 0);
    const pendingProfile = await as(tx, ids.p, () => tx`select name from public.profiles where user_id = ${ids.a}`);
    expect("a pending friend reads no profile", pendingProfile.length === 0);
    const noView = await tx`select count(*)::int as n from pg_views where schemaname = 'public' and viewname = 'checkins_public'`;
    expect("definer-rights view is gone", one(noView).n === 0);
    const forge = await as(tx, ids.b, async () => {
      try {
        await tx.savepoint(async (sp) => {
          await sp`insert into public.checkins (user_id, problem_slug, result) values (${ids.a}, 'rls-problem', 'failed')`;
        });
        return "allowed";
      } catch {
        return "blocked";
      }
    });
    expect("user cannot write a check-in for someone else", forge === "blocked");
    const forgeNote = await as(tx, ids.b, async () => {
      try {
        await tx.savepoint(async (sp) => {
          await sp`insert into public.checkin_notes (checkin_id, user_id, note) values (${checkin.id}, ${ids.b}, 'x')`;
        });
        return "allowed";
      } catch {
        return "blocked";
      }
    });
    expect("user cannot attach a note to someone else's check-in", forgeNote === "blocked");

    // Approvals: users can't approve themselves; admins can decide.
    const selfApprove = await as(
      tx,
      ids.p,
      () => tx`update public.user_approvals set status = 'approved', decided_at = now() where user_id = ${ids.p} returning user_id`,
    );
    expect("pending user cannot approve themselves", selfApprove.length === 0);
    await tx`update public.user_approvals set is_admin = true where user_id = ${ids.a}`;
    const adminApprove = await as(
      tx,
      ids.a,
      () =>
        tx`update public.user_approvals set status = 'approved', decided_at = now(), decided_by = ${ids.a} where user_id = ${ids.p} returning user_id`,
    );
    expect("admin can approve a pending user", adminApprove.length === 1);

    // Profiles: approved users see their friends (via the new column grants & policy);
    // nobody edits someone else's.
    const friendProfile = await as(tx, ids.b, () => tx`select name from public.profiles where user_id = ${ids.a}`);
    expect(
      "approved user reads a friend's profile but only granted columns",
      friendProfile.length === 1 && friendProfile[0]?.name === "RLS a",
    );
    const readLanguage = await as(tx, ids.b, async () => {
      try {
        await tx.savepoint(async (sp) => {
          await sp`select language from public.profiles where user_id = ${ids.a}`;
        });
        return "allowed";
      } catch {
        return "blocked";
      }
    });
    expect("cannot read ungranted columns on profiles", readLanguage === "blocked");
    const readNotifications = await as(tx, ids.b, async () => {
      try {
        await tx.savepoint(async (sp) => {
          await sp`select notifications from public.profiles where user_id = ${ids.a}`;
        });
        return "allowed";
      } catch {
        return "blocked";
      }
    });
    expect("a friend cannot read notifications", readNotifications === "blocked");
    const readLeetcode = await as(tx, ids.b, async () => {
      try {
        await tx.savepoint(async (sp) => {
          await sp`select leetcode_username from public.profiles where user_id = ${ids.a}`;
        });
        return "allowed";
      } catch {
        return "blocked";
      }
    });
    expect("a friend cannot read leetcode_username", readLeetcode === "blocked");
    const nonFriendProfile = await as(tx, ids.c, () => tx`select name from public.profiles where user_id = ${ids.a}`);
    expect("approved non-friend cannot read profile", nonFriendProfile.length === 0);
    const editFriend = await as(tx, ids.b, () => tx`update public.profiles set name = 'hacked' where user_id = ${ids.a} returning user_id`);
    expect("user cannot edit a friend's profile", editFriend.length === 0);

    // Feed: answers and card state are the answerer's own; batch verdicts are admin-only;
    // a hidden card leaves everyone's feed except admins'. (A is an admin by now, B is not.)
    const live = one(await tx`select id from public.cards where topic_slug = 'rls-topic' and status = 'live'`);
    // Fixture rows go in as the owner: since 041 the API roles cannot write these tables at all.
    {
      await tx`insert into public.card_reviews (user_id, card_id, answer, score, outcome, graded_by)
               values (${ids.b}, ${live.id}, 'x', 1, 'correct', 'match')`;
      await tx`insert into public.card_state (user_id, card_id, stability, difficulty, due_at)
               values (${ids.b}, ${live.id}, 1, 5, now())`;
    }
    const peek = await as(
      tx,
      ids.a,
      () => tx`select
        (select count(*)::int from public.card_reviews where user_id = ${ids.b}) as reviews,
        (select count(*)::int from public.card_state where user_id = ${ids.b}) as state`,
    );
    expect("nobody else reads your card answers or review state", one(peek).reviews === 0 && one(peek).state === 0);
    const verdict = async (userId: string) =>
      as(tx, userId, async () => {
        try {
          await tx.savepoint(async (sp) => {
            await sp`insert into public.batch_review_items (batch_id, card_id, verdict) values (${batch.id}, ${live.id}, 'good')`;
          });
          return "allowed";
        } catch {
          return "blocked";
        }
      });
    // Admins record verdicts on the server connection; nobody, admin or not, writes them over the API.
    expect("nobody records batch verdicts over the API", (await verdict(ids.b)) === "blocked" && (await verdict(ids.a)) === "blocked");
    await tx`update public.cards set hidden = true where id = ${live.id}`;
    const hiddenForB = await as(tx, ids.b, () => tx`select id from public.cards where id = ${live.id}`);
    const hiddenForA = await as(tx, ids.a, () => tx`select id from public.cards where id = ${live.id}`);
    expect("a hidden card leaves the feed but admins still see it", hiddenForB.length === 0 && hiddenForA.length === 1);

    // App settings are server-only: not even an approved admin reads or writes them over the API roles.
    await tx`insert into public.app_settings (key, value) values ('ai_paused', 'false'::jsonb) on conflict (key) do nothing`;
    const settingsAccess = async (userId: string, statement: "read" | "write") =>
      as(tx, userId, async () => {
        try {
          await tx.savepoint(async (sp) => {
            if (statement === "read") await sp`select key from public.app_settings`;
            else await sp`update public.app_settings set value = 'true'::jsonb where key = 'ai_paused'`;
          });
          return "allowed";
        } catch {
          return "blocked";
        }
      });
    expect(
      "settings are not readable or writable over the API, even by an admin",
      (await settingsAccess(ids.a, "read")) === "blocked" &&
        (await settingsAccess(ids.a, "write")) === "blocked" &&
        (await settingsAccess(ids.b, "read")) === "blocked",
    );

    // Opened lessons are each reader's own, like studied ones: not even a friend sees them. They carry
    // counters for admin Analytics, so nobody writes them over the API roles, not even an approved owner;
    // the server connection (markOpened) is the only writer.
    await tx`insert into public.topic_opens (user_id, topic_slug) values (${ids.a}, 'rls-topic')`;
    const opensFor = (userId: string) => as(tx, userId, () => tx`select user_id from public.topic_opens where topic_slug = 'rls-topic'`);
    const openWrite = async (userId: string, write: (sp: typeof tx) => Promise<unknown>) =>
      as(tx, userId, async () => {
        try {
          await tx.savepoint(async (sp) => {
            const hit = await write(sp as unknown as typeof tx);
            if (Array.isArray(hit) && hit.length === 0) throw new Error("no row touched");
          });
          return "allowed";
        } catch {
          return "blocked";
        }
      });
    const openPrivileges = one(
      await tx`select has_table_privilege('authenticated', 'public.topic_opens', 'insert') as auth_insert,
                      has_table_privilege('authenticated', 'public.topic_opens', 'update') as auth_update,
                      has_table_privilege('anon', 'public.topic_opens', 'update') as anon_update`,
    );
    expect(
      "opened lessons are owner-read-only, and nobody writes them or their counters over the API",
      (await opensFor(ids.a)).length === 1 &&
        (await opensFor(ids.b)).length === 0 &&
        openPrivileges.auth_insert === false &&
        openPrivileges.auth_update === false &&
        openPrivileges.anon_update === false &&
        (await openWrite(ids.c, (sp) => sp`insert into public.topic_opens (user_id, topic_slug) values (${ids.c}, 'rls-topic')`)) ===
          "blocked" &&
        (await openWrite(
          ids.a,
          (sp) => sp`update public.topic_opens set open_count = 2147483647 where user_id = ${ids.a} returning user_id`,
        )) === "blocked" &&
        (await openWrite(ids.a, (sp) => sp`delete from public.topic_opens where user_id = ${ids.a} returning user_id`)) === "blocked",
    );

    // Share codes: the code is what makes a public image reachable, so it is owner-read-only
    // like any private row. Strangers, friends and anon read nothing, and nobody writes over
    // the API roles (not even the owner); the server connection, which bypasses RLS, writes
    // and the public route reads.
    await tx`insert into public.share_codes (user_id, code) values (${ids.a}, 'rlsa0001'), (${ids.p}, 'rlsp0001')`;
    const codesFor = (userId: string) => as(tx, userId, () => tx`select user_id from public.share_codes where code = 'rlsa0001'`);
    const codeWrite = async (userId: string, write: (sp: typeof tx) => Promise<unknown>) =>
      as(tx, userId, async () => {
        try {
          await tx.savepoint(async (sp) => {
            const hit = await write(sp as unknown as typeof tx);
            if (Array.isArray(hit) && hit.length === 0) throw new Error("no row touched");
          });
          return "allowed";
        } catch {
          return "blocked";
        }
      });
    // Anon holds no grant, so a read would raise and abort the transaction; ask the catalog.
    const shareCodePrivileges = one(
      await tx`select has_table_privilege('anon', 'public.share_codes', 'select') as anon_read,
                      has_table_privilege('authenticated', 'public.share_codes', 'insert') as auth_insert`,
    );
    expect(
      "share codes: the approved owner reads their own, no one else's; nobody writes over the API",
      (await codesFor(ids.a)).length === 1 &&
        (await codesFor(ids.b)).length === 0 &&
        (await codesFor(ids.p)).length === 0 &&
        shareCodePrivileges.anon_read === false &&
        shareCodePrivileges.auth_insert === false &&
        (await codeWrite(ids.c, (sp) => sp`insert into public.share_codes (user_id, code) values (${ids.c}, 'rlsc0001')`)) === "blocked" &&
        (await codeWrite(ids.a, (sp) => sp`update public.share_codes set code = 'rlsa0002' where user_id = ${ids.a} returning user_id`)) ===
          "blocked" &&
        (await codeWrite(ids.a, (sp) => sp`delete from public.share_codes where user_id = ${ids.a} returning user_id`)) === "blocked",
    );

    // XP is the owner's to read and the server's to write: an approved owner sees their own
    // points, not even a friend sees them, a pending user sees nothing, and nobody writes
    // over the API roles. The unique keys make an award idempotent.
    await tx`insert into public.xp_events (user_id, day, kind, ref, xp) values
             (${ids.a}, '2026-09-01', 'problem', 'rls-problem', 30),
             (${ids.a}, '2026-09-01', 'bonus', '2026-09-01', 20),
             (${ids.p}, '2026-09-01', 'problem', 'rls-problem', 30)`;
    const xpOf = (viewer: string, owner: string) => as(tx, viewer, () => tx`select xp from public.xp_events where user_id = ${owner}`);
    const xpWrite = async (viewer: string, statement: "insert" | "update" | "delete") =>
      as(tx, viewer, async () => {
        try {
          await tx.savepoint(async (sp) => {
            if (statement === "insert") {
              await sp`insert into public.xp_events (user_id, day, kind, ref, xp) values (${viewer}, '2026-09-02', 'topic', 'rls-topic', 20)`;
            } else if (statement === "update") {
              // An update that matched no visible row would "succeed" silently, so require a row.
              const rows = await sp`update public.xp_events set xp = 9999 where user_id = ${viewer} returning id`;
              if (!rows.length) throw new Error("no row");
            } else {
              const rows = await sp`delete from public.xp_events where user_id = ${viewer} returning id`;
              if (!rows.length) throw new Error("no row");
            }
          });
          return "allowed";
        } catch {
          return "blocked";
        }
      });
    const xpMine = await xpOf(ids.a, ids.a);
    await tx`update public.user_approvals set status = 'pending', decided_at = null where user_id = ${ids.p}`;
    const pendingXp = await xpOf(ids.p, ids.p);
    await tx`update public.user_approvals set status = 'approved', decided_at = now() where user_id = ${ids.p}`;
    expect(
      "an owner reads their own XP, a friend and a stranger read none of it, and a pending user reads nothing",
      xpMine.length === 2 && (await xpOf(ids.b, ids.a)).length === 0 && (await xpOf(ids.c, ids.a)).length === 0 && pendingXp.length === 0,
    );
    expect(
      "nobody writes XP over the API roles: no insert, update or delete, even on their own rows",
      (await xpWrite(ids.a, "insert")) === "blocked" &&
        (await xpWrite(ids.a, "update")) === "blocked" &&
        (await xpWrite(ids.a, "delete")) === "blocked",
    );
    const xpPrivileges = one(
      await tx`select
        has_table_privilege('authenticated', 'public.xp_events', 'insert') as ins,
        has_table_privilege('authenticated', 'public.xp_events', 'update') as upd,
        has_table_privilege('authenticated', 'public.xp_events', 'delete') as del,
        has_table_privilege('anon', 'public.xp_events', 'select') as anon_read`,
    );
    expect(
      "the API roles hold no write grant on xp_events, and anonymous holds no read",
      !xpPrivileges.ins && !xpPrivileges.upd && !xpPrivileges.del && !xpPrivileges.anon_read,
      JSON.stringify(xpPrivileges),
    );
    const xpInsert = async (day: string, kind: string, ref: string, xp: number) => {
      try {
        await tx.savepoint(async (sp) => {
          await sp`insert into public.xp_events (user_id, day, kind, ref, xp) values (${ids.a}, ${day}, ${kind}, ${ref}, ${xp})`;
        });
        return "allowed";
      } catch {
        return "blocked";
      }
    };
    expect(
      "the same award cannot be written twice on a day, a problem pays once ever, and an XP of 0 is refused",
      (await xpInsert("2026-09-01", "bonus", "2026-09-01", 5)) === "blocked" &&
        (await xpInsert("2026-09-05", "problem", "rls-problem", 5)) === "blocked" &&
        (await xpInsert("2026-09-06", "card", "x", 0)) === "blocked" &&
        (await xpInsert("2026-09-05", "bonus", "2026-09-05", 5)) === "allowed",
    );

    // Problem reports are server written and server read: the API roles hold no grant and
    // no policy, so not even the author reads or writes one from a client.
    await tx`insert into public.problem_reports (user_id, message) values (${ids.a}, 'rls report')`;
    const reportAccess = async (viewer: string, statement: "select" | "insert" | "update") =>
      as(tx, viewer, async () => {
        try {
          await tx.savepoint(async (sp) => {
            if (statement === "select") await sp`select id from public.problem_reports where user_id = ${viewer}`;
            else if (statement === "insert") await sp`insert into public.problem_reports (user_id, message) values (${viewer}, 'x')`;
            else await sp`update public.problem_reports set resolved_at = now() where user_id = ${viewer}`;
          });
          return "allowed";
        } catch {
          return "blocked";
        }
      });
    expect(
      "nobody reads, writes or resolves a problem report over the API roles, not even the author",
      (await reportAccess(ids.a, "select")) === "blocked" &&
        (await reportAccess(ids.a, "insert")) === "blocked" &&
        (await reportAccess(ids.a, "update")) === "blocked" &&
        (await reportAccess(ids.b, "select")) === "blocked",
    );
    const reportPrivileges = one(
      await tx`select
        has_table_privilege('authenticated', 'public.problem_reports', 'select') as sel,
        has_table_privilege('anon', 'public.problem_reports', 'insert') as anon_ins,
        (select relrowsecurity from pg_class where oid = 'public.problem_reports'::regclass) as rls`,
    );
    expect(
      "problem_reports has row security on and no API grant",
      reportPrivileges.rls === true && !reportPrivileges.sel && !reportPrivileges.anon_ins,
      JSON.stringify(reportPrivileges),
    );

    // Coach: each user's coach is theirs alone; friends see only mock scores.
    {
      const thread = one(await tx`insert into public.coach_threads (user_id, title) values (${ids.a}, 'mine') returning id`);
      await tx`insert into public.coach_messages (thread_id, user_id, role, parts) values (${thread.id}, ${ids.a}, 'user', '[]')`;
      await tx`insert into public.coach_memory (user_id, kind, text) values (${ids.a}, 'habit', 'rushes edge cases')`;
      await tx`insert into public.stories (user_id, title) values (${ids.a}, 'Outage story')`;
      const mock = one(
        await tx`insert into public.mocks (user_id, type, topic, status, score) values (${ids.a}, 'design', 'url shortener', 'done', 71) returning id`,
      );
      await tx`insert into public.mock_details (mock_id, user_id, prompt) values (${mock.id}, ${ids.a}, 'secret transcript')`;
    }
    const coachPeek = one(
      await as(
        tx,
        ids.b,
        () => tx`select
        (select count(*)::int from public.coach_threads where user_id = ${ids.a}) as threads,
        (select count(*)::int from public.coach_messages where user_id = ${ids.a}) as messages,
        (select count(*)::int from public.coach_memory where user_id = ${ids.a}) as memory,
        (select count(*)::int from public.stories where user_id = ${ids.a}) as stories,
        (select count(*)::int from public.mock_details where user_id = ${ids.a}) as details,
        (select count(*)::int from public.mocks where user_id = ${ids.a}) as mocks`,
      ),
    );
    expect(
      "a friend can't read your coach threads, messages, memory, stories or mock transcripts",
      coachPeek.threads === 0 && coachPeek.messages === 0 && coachPeek.memory === 0 && coachPeek.stories === 0 && coachPeek.details === 0,
    );
    expect("a friend sees your mock score", coachPeek.mocks === 1);
    const nonFriendMocks = await as(tx, ids.c, () => tx`select count(*)::int as n from public.mocks where user_id = ${ids.a}`);
    expect("non-friend sees no mock scores", one(nonFriendMocks).n === 0);
    const intrude = await as(tx, ids.b, async () => {
      try {
        await tx.savepoint(async (sp) => {
          const t = one(await sp`select id from public.coach_threads where user_id = ${ids.a} limit 1`);
          await sp`insert into public.coach_messages (thread_id, user_id, role) values (${t.id}, ${ids.b}, 'user')`;
        });
        return "allowed";
      } catch {
        return "blocked";
      }
    });
    expect("you can't post into someone else's coach thread", intrude === "blocked");

    // Tracker: friends see days, campaigns and readiness; missions, reviews and push stay private.
    const campaign = one(
      await tx`insert into public.campaigns (user_id, start_date, length_days, templates)
               values (${ids.a}, '2026-09-01', 90, '{}') returning id`,
    );
    {
      await tx`insert into public.days (user_id, date, campaign_id, status) values (${ids.a}, '2026-09-01', ${campaign.id}, 'done')`;
      await tx`insert into public.missions (user_id, date, slot_type, ref, est_minutes) values (${ids.a}, '2026-09-01', 'new_problem', 'rls-problem', 40)`;
      await tx`insert into public.problem_reviews (user_id, problem_slug, step, due_date) values (${ids.a}, 'rls-problem', 1, '2026-09-04')`;
      await tx`insert into public.readiness_snapshots (user_id, date, overall) values (${ids.a}, '2026-09-01', 40)`;
      await tx`insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values (${ids.a}, 'https://push.example.test/a', 'k', 'a')`;
    }
    const friendView = await as(
      tx,
      ids.b,
      () => tx`select
        (select count(*)::int from public.days where user_id = ${ids.a}) as days,
        (select count(*)::int from public.campaigns where user_id = ${ids.a}) as campaigns,
        (select count(*)::int from public.readiness_snapshots where user_id = ${ids.a}) as readiness,
        (select count(*)::int from public.missions where user_id = ${ids.a}) as missions,
        (select count(*)::int from public.problem_reviews where user_id = ${ids.a}) as reviews,
        (select count(*)::int from public.push_subscriptions where user_id = ${ids.a}) as push`,
    );
    const f = one(friendView);
    expect("friend reads days, campaign and readiness", f.days === 1 && f.campaigns === 1 && f.readiness === 1);
    expect("friend cannot read missions, reviews or push", f.missions === 0 && f.reviews === 0 && f.push === 0);
    const nonFriendView = await as(
      tx,
      ids.c,
      () => tx`select
        (select count(*)::int from public.days where user_id = ${ids.a}) as days,
        (select count(*)::int from public.campaigns where user_id = ${ids.a}) as campaigns,
        (select count(*)::int from public.readiness_snapshots where user_id = ${ids.a}) as readiness`,
    );
    const nf = one(nonFriendView);
    expect("non-friend reads no days, campaigns or readiness", nf.days === 0 && nf.campaigns === 0 && nf.readiness === 0);
    const anonDays = await attempt(tx, null, (sp) => sp`select count(*)::int as n from public.days where user_id = ${ids.a}`);
    expect("anonymous user cannot read days at all (no grant)", anonDays === "denied");
    const tamper = await attempt(tx, ids.b, (sp) => sp`update public.days set status = 'missed' where user_id = ${ids.a} returning date`);
    expect("friend cannot change someone else's day", tamper === "denied" || tamper.length === 0);
    const ownDay = await attempt(tx, ids.a, (sp) => sp`update public.days set status = 'missed' where user_id = ${ids.a} returning date`);
    expect("nor can the owner change their own day over the API (no update grant)", ownDay === "denied");

    // Transitive visibility: A–B and B–D are friends; A and D are not. A reading
    // D's rows must return nothing, and B reading the same rows must return them —
    // the second half is what proves the fixture is a real friend-of-friend rather
    // than an ACL that simply blocks everything.
    const dCampaign = one(
      await tx`insert into public.campaigns (user_id, start_date, length_days, templates)
               values (${ids.d}, '2026-09-01', 90, '{}') returning id`,
    );
    await tx`insert into public.checkins (user_id, problem_slug, result, minutes) values (${ids.d}, 'rls-problem', 'solved', 25)`;
    {
      await tx`insert into public.days (user_id, date, campaign_id, status) values (${ids.d}, '2026-09-01', ${dCampaign.id}, 'done')`;
      await tx`insert into public.readiness_snapshots (user_id, date, overall) values (${ids.d}, '2026-09-01', 55)`;
      await tx`insert into public.mocks (user_id, type, topic, status, score) values (${ids.d}, 'design', 'url shortener', 'done', 60)`;
    }
    const peekAtD = (viewer: string) =>
      as(
        tx,
        viewer,
        () => tx`select
          (select count(*)::int from public.checkins where user_id = ${ids.d}) as checkins,
          (select count(*)::int from public.days where user_id = ${ids.d}) as days,
          (select count(*)::int from public.campaigns where user_id = ${ids.d}) as campaigns,
          (select count(*)::int from public.readiness_snapshots where user_id = ${ids.d}) as readiness,
          (select count(*)::int from public.mocks where user_id = ${ids.d}) as mocks,
          (select count(*)::int from public.profiles where user_id = ${ids.d}) as profiles`,
      );
    const strangerToD = one(await peekAtD(ids.a));
    expect(
      "a friend of a friend reads none of their check-ins, days, campaign, readiness, mocks or profile",
      strangerToD.checkins === 0 &&
        strangerToD.days === 0 &&
        strangerToD.campaigns === 0 &&
        strangerToD.readiness === 0 &&
        strangerToD.mocks === 0 &&
        strangerToD.profiles === 0,
      JSON.stringify(strangerToD),
    );
    const friendOfD = one(await peekAtD(ids.b));
    expect(
      "the mutual friend does read them, so the block above is friendship and not a broken fixture",
      friendOfD.checkins === 1 &&
        friendOfD.days === 1 &&
        friendOfD.campaigns === 1 &&
        friendOfD.readiness === 1 &&
        friendOfD.mocks === 1 &&
        friendOfD.profiles === 1,
      JSON.stringify(friendOfD),
    );
    const dReadsA = await as(tx, ids.d, () => tx`select count(*)::int as n from public.checkins where user_id = ${ids.a}`);
    expect("and the friend of a friend reads nothing the other way either", one(dReadsA).n === 0);

    // friend_invites: you see invites you sent and invites addressed to your
    // email, and nothing else.
    await tx`insert into public.friend_invites (email, invited_by) values (${"rls-a@example.test"}, ${ids.b})`;
    const inviteToA = await as(tx, ids.a, () => tx`select id from public.friend_invites where email = ${"rls-a@example.test"}`);
    expect("the invite is visible to the address it names", inviteToA.length === 1);
    const inviteSeenByB = await as(tx, ids.b, () => tx`select id from public.friend_invites`);
    expect("the sender sees the invite they sent", inviteSeenByB.length === 1);
    const inviteToStranger = await as(tx, ids.c, () => tx`select id from public.friend_invites`);
    expect("friend_invites addressed to someone else are invisible", inviteToStranger.length === 0);

    // The user_a < user_b check rejects a reversed pair. Run as the table owner
    // (not the authenticated role) so RLS — which has no insert policy on
    // friendships — is not what blocks it; the check constraint must be.
    const reversed = await (async () => {
      try {
        await tx.savepoint(async (sp) => {
          await sp`insert into public.friendships (user_a, user_b) values (${ids.b}, ${ids.a})`;
        });
        return "allowed";
      } catch {
        return "blocked";
      }
    })();
    expect("a reversed pair (user_a > user_b) is rejected", reversed === "blocked");

    // Since 20260929000023 the write grants are gone too, so a client write now
    // fails on a privilege it does not hold before RLS is even consulted. The
    // reversed-pair test above runs as the owner on purpose; this is the
    // authenticated side of the same door.
    const friendshipsWrites = one(
      await tx`select
        has_table_privilege('authenticated', 'public.friendships', 'insert') as ins,
        has_table_privilege('authenticated', 'public.friendships', 'update') as upd,
        has_table_privilege('authenticated', 'public.friendships', 'delete') as del`,
    );
    expect(
      "authenticated has no write grant on friendships, so a forged pair fails on privilege too",
      friendshipsWrites.ins === false && friendshipsWrites.upd === false && friendshipsWrites.del === false,
      JSON.stringify(friendshipsWrites),
    );

    throw ROLLBACK;
  });
} catch (e) {
  if (e !== ROLLBACK) {
    console.error(`FAIL setup: ${(e as Error).message}`);
    failures.push("setup");
  }
} finally {
  await sql.end();
}

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log("\nAll RLS checks passed");
