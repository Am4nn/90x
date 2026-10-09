-- ===========================================================================
-- DELETED_ACCOUNTS: a short record of each deleted account, for admins.
--
-- One row per deletion, written by removeAccount (lib/account/remove.ts) before the auth user
-- is deleted, and taken back if that deletion fails. One row per account too: user_id is unique
-- while set, and a retry reuses its row. Admins see it in the Deleted section of /admin/users.
-- user_id has no foreign key: the auth user is gone by design.
-- After 90 days the hourly job (lib/account/deleted.ts) first deletes any expired row whose
-- account still exists (never a real deletion), then empties the rest: user_id, email, name and
-- signed_up_at become null and deleted_at keeps only its month. What stays is a count: the month
-- and deleted_by. count(*) is the all-time number of deleted accounts. The privacy policy states
-- both.
-- Written and read only by the app server; no client grants (042 closed the Data API).
-- Locks: a new table takes no lock anyone waits on.
-- ===========================================================================
create table public.deleted_accounts (
    id           bigserial primary key,
    user_id      uuid,
    email        text,
    name         text,
    signed_up_at timestamptz,
    deleted_at   timestamptz not null default now(),
    deleted_by   text not null check (deleted_by in ('self','admin'))
);
-- The purge and the Deleted list only want records that still hold something personal; after 90 days
-- nearly every row is an emptied count, so the index keeps to the few that are not.
create index deleted_accounts_personal_idx on public.deleted_accounts (deleted_at)
    where email is not null or name is not null or user_id is not null;
-- One record per account: removeAccount upserts on this, so a retry never counts a deletion twice.
create unique index deleted_accounts_user_id_key on public.deleted_accounts (user_id) where user_id is not null;
alter table public.deleted_accounts enable row level security;
revoke all on public.deleted_accounts from anon, authenticated;
revoke all on sequence public.deleted_accounts_id_seq from anon, authenticated;
