# Backups

The production database (Supabase, free plan, Mumbai) is dumped every night by
a GitHub Action, encrypted, and kept for 30 days in a private Cloudflare R2 bucket. The free plan has no
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

- Nightly at 21:30 UTC (03:00 IST), and on demand (`gh workflow run "DB backup"`).
- Stored in a **private Cloudflare R2 bucket** (the private R2 bucket `db-backups`, folder `90x/`: `90x/90x-<UTC timestamp>.dump.gpg`), never as a
  GitHub artifact: this repo is public, and anyone signed in to GitHub can download a public repo's
  artifacts. The file is GPG-encrypted (AES-256) on the runner as well, so the bucket and the
  passphrase would both have to leak.
- Kept 30 days by the bucket's lifecycle rule.
- A failed run emails the owner (GitHub notifies on failed scheduled runs).

## One-time setup (owner)

1. Cloudflare dashboard > R2: the private bucket `db-backups` holds backups for several apps;
   90x writes under `90x/`. Keep it private (no public access, no custom domain, no CORS: uploads
   come from the GitHub runner, never a browser).
2. In the bucket's Settings > Object lifecycle rules: delete objects with prefix `90x/` after 30 days (`30d-auto-delete-rule`).
3. R2 > Manage API tokens > Create token: **Object Read & Write**, scoped to `db-backups` only, its own token (not shared with any app,
   so a leak cannot reach another app's bucket). The secret is the 64-hex **Secret Access Key**,
   not the token value.
   Note the Access Key ID, Secret Access Key, and the S3 endpoint
   `https://<account-id>.r2.cloudflarestorage.com`.
4. Put them in `web/.env.local` as `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`,
   `R2_BUCKET=db-backups` (git-ignored), then set the four repo secrets from it without echoing them
   (`gh secret set NAME -R Am4nn/90x` reads the value from stdin). `PROD_DB_URL` (Supabase **Session
   pooler**, port 5432; not 6543) and `BACKUP_PASSPHRASE` (random, also kept in a password manager:
   without it no backup can be read) are set the same way.
5. `gh workflow enable "DB backup"`, then `gh workflow run "DB backup"` and run the drill below.

## Download a backup

With the R2 values from `web/.env.local` in the environment (AWS CLI, or any S3 client):

```bash
export AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... AWS_DEFAULT_REGION=auto
aws s3 ls "s3://$R2_BUCKET/90x/" --endpoint-url "$R2_ENDPOINT"
aws s3 cp "s3://$R2_BUCKET/90x/90x-<ts>.dump.gpg" backup/ --endpoint-url "$R2_ENDPOINT"
```

## Restore drill (local, safe)

```bash
BACKUP_PASSPHRASE=... web/scripts/db/restore-drill.sh backup/90x-<ts>.dump.gpg
```

It decrypts, restores into a scratch database on the local Supabase only (it refuses any other
host), prints row counts and the latest `created_at` of the key tables, then drops the scratch
database (`--keep` to keep it).

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
| 2026-10-05 | [37334630251](https://github.com/Am4nn/90x/actions/runs/37334630251) (manual, 6.0 MB encrypted) | Claude for Aman | DRILL OK | Restored into a local scratch DB: 9 users, 3875 cards, 3693 problems, 274 topics, 83 card reviews, 52 XP events. Only error: the harmless `schema "public" already exists`. |
| 2026-10-05 | [37339030811](https://github.com/Am4nn/90x/actions/runs/37339030811) (manual, first run that uploads to the private R2 bucket; 6.0 MB encrypted, downloaded from R2) | Claude for Aman | DRILL OK | Decrypted and restored into a local scratch DB: 9 users, 3875 cards. Only error: the harmless `schema "public" already exists`. |
