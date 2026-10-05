# Backups

The production database (Supabase, free plan, Mumbai) is dumped every night by
a GitHub Action, encrypted, and kept for 14 days. The free plan has no
point-in-time recovery and no downloadable backups of its own, so this is the
only copy outside Supabase.

## What is backed up

| Included | Why |
| --- | --- |
| Schema `public` (schema and data) | Every app table: profiles, topics, cards, card reviews, check-ins, missions, xp_events, coach threads, friends, and so on. |
| Schema `auth` (schema and data) | `auth.users` and `auth.identities` are what let people sign in as the same account again. |

Not included, and how to get each back:

- **Supabase Storage.** The app stores no files there. Nothing to back up.
- **Extensions.** `citext` (public) is created by migration `20260929000019_friends.sql`; `uuid-ossp` and `pgcrypto` ship with Supabase.
- **Project settings.** Google OAuth client, auth redirect URLs, the admin "auto-approve" switch lives in `app_settings` (backed up), but dashboard settings are not. Re-enter them from the Supabase dashboard.
- **Secrets and env vars** (Vercel, QStash, Upstash Redis, AI keys). Keep these in your password manager.
- **Sessions.** `auth.sessions` and refresh tokens are not restored; everyone signs in again with Google.

## Schedule, retention, location

- Runs at 21:30 UTC (03:00 IST) every day, and on demand from the Actions tab (`DB backup`, Run workflow).
- Each run uploads one artifact, `90x-db-<timestamp>`, containing `90x-<timestamp>.dump.gpg`.
- Kept 14 days (`retention-days: 14`), then GitHub deletes it. That is 14 restore points.
- Runs never overlap (concurrency group `db-backup`) and are killed after 20 minutes.
- Failure: a failed scheduled run emails the repository owner (GitHub's default notification for workflow failures; keep "Actions" notifications on in GitHub settings). A missing secret fails the run on purpose.

## The repo is public: why the file is encrypted

For a **public** repository, anyone signed in to GitHub can download its workflow
artifacts. So a plaintext dump would hand every user's email and every note to
the internet. The workflow encrypts with GPG (symmetric, AES-256) on the runner
and uploads only the `.gpg` file; the plaintext is deleted before upload and
the passphrase and connection string are masked in logs. Consequences:

- The passphrase is the only protection. Use a long random one (for example `openssl rand -base64 36`), and store it in your password manager. **If you lose it, every backup is unreadable.**
- Anyone could download and try to brute-force an artifact offline, so never reuse a weak or guessable passphrase.
- Rotating the passphrase only protects future backups; older artifacts keep the old one until they expire.
- The workflow runs only on `schedule` and `workflow_dispatch`, never on pull requests or forks, so PR code cannot read the secrets.

## One-time setup (owner)

1. Supabase dashboard, Connect, copy the **Direct connection** string, or the **Session pooler** string (port 5432) if your network is IPv4 only (GitHub runners are IPv4 only, and Supabase direct connections are IPv6 only on the free plan, so you will most likely need the **session pooler**). Do not use the **transaction pooler** (port 6543): `pg_dump` needs session features it does not support. The user is `postgres.<project-ref>` on the pooler.
2. Set the two secrets (`gh secret set` prompts for the value, so it never lands in shell history):

   ```
   gh secret set PROD_DB_URL     # paste the postgres:// URL with the real password
   gh secret set BACKUP_PASSPHRASE   # paste the passphrase
   ```

   (Run from a checkout of the repo, or add `-R Am4nn/90x`.)
3. Trigger the first backup: `gh workflow run "DB backup"` then `gh run watch`. Confirm it is green and an artifact appears.

## Download a backup

```
gh run list --workflow "DB backup" --limit 5
gh run download <run-id> -n 90x-db-<timestamp> -D ./backup
```

This gives `./backup/90x-<timestamp>.dump.gpg`. Decrypt by hand if you need the
plain file (the drill script does it for you):

```
gpg --batch --pinentry-mode loopback --passphrase "$BACKUP_PASSPHRASE" -d -o 90x.dump backup/90x-<timestamp>.dump.gpg
```

Delete plaintext dumps when you are done. They contain everyone's data.

## Restore drill (local, safe)

Proves a backup restores, without touching production. Needs the local Supabase
stack running (`supabase start`; Postgres on `127.0.0.1:64322`) and `gpg`. It uses
host `pg_restore`/`psql` if installed, otherwise `docker exec` into
`supabase_db_90X`.

```
export BACKUP_PASSPHRASE=...        # or it prompts
web/scripts/db/restore-drill.sh backup/90x-<timestamp>.dump.gpg
```

It decrypts to a temp dir, creates `drill_<timestamp>`, creates the extensions,
runs `pg_restore --no-owner --no-privileges`, prints row counts and the latest
`created_at` for the key tables (users, profiles, topics, cards, card reviews,
check-ins, missions, xp_events, coach threads, problems), then drops the
database. `--keep` keeps it for poking around. It refuses any host other than
`127.0.0.1` or `localhost`. Pass criteria: `DRILL OK`, counts close to the
production numbers, and a latest `created_at` within a day of the backup. One
error, `schema "public" already exists`, is expected and harmless.

Run a drill after setup, then monthly, and after any migration that adds a
table.

## Real restore into a NEW Supabase project

Use this if production is lost or corrupted. Do not restore over a live project
you still need.

1. Create a new Supabase project (Postgres 17, same region). Note the **session pooler or direct** connection string as `NEW_DB_URL` (password from project creation).
2. Apply the schema with the repo's migrations, not the dump, so Supabase-managed grants, RLS, triggers and roles are exactly right: `supabase link --project-ref <new-ref>` then `supabase db push`. This also creates the `citext` extension.
3. Download and decrypt the backup (above).
4. Load the data only. Triggers and FK ordering are switched off for the session so the `auth.users` insert does not auto-create duplicate profile rows:

   ```
   export PGOPTIONS="-c session_replication_role=replica"
   pg_restore --data-only --no-owner --no-privileges -d "$NEW_DB_URL" -n public 90x.dump
   pg_restore --data-only --no-owner --no-privileges -d "$NEW_DB_URL" -t auth.users -t auth.identities 90x.dump
   ```

   Use a `pg_restore` of major version 17 or newer. If the `session_replication_role` option is refused, restore `auth.users` and `auth.identities` first, then delete the auto-created `public.profiles` rows for those users and restore `public` after.
5. Point the app at the new project: update the Supabase URL, anon and service keys, and the database URL in Vercel, re-enter the Google OAuth client and redirect URLs in the new project's Auth settings, then redeploy.
6. Check: a known user can sign in with Google and sees their history, `select count(*) from auth.users` matches `public.profiles`.

What restores cleanly and what does not:

| Item | Result |
| --- | --- |
| All `public` tables and rows | Clean (data-only into migrated schema). |
| `auth.users`, `auth.identities` | Clean for Google sign-in: same user ids, so every foreign key in `public` still lines up. |
| Passwords | Sign-in is Google only, so none to lose. |
| `auth.sessions`, refresh tokens, MFA, audit log, one-time tokens | Not restored (not needed); everyone signs in again. |
| Roles, grants, RLS, owners | Come from migrations, not the dump (`--no-owner --no-privileges`). |
| Full schema restore from the dump into a fresh Supabase project | Do not. `auth` already exists there and is owned by Supabase, so `CREATE` statements conflict. The drill does this into an empty local database only to prove the file is readable. |
| Cron and QStash schedules, Vercel env, OAuth settings | Not in the database; redo them (`web/scripts/schedule-jobs.ts` recreates the QStash schedules). |

## Last drill

Fill in after each drill.

| Date | Backup run | Who | Result | Notes |
| --- | --- | --- | --- | --- |
| _not yet run_ | | | | |
