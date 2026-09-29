-- ===========================================================================
-- FRIENDS
-- A real friend graph: invite by email, accept or decline, then the two of
-- you can see each other. Nobody else can discover who uses the app.
--
-- Three things were also over-sharing and are fixed here:
--   1. profiles_read returned the whole profile row (leetcode_username,
--      notifications, campaign_days, timezone, role, language) to any
--      approved user. Only name and avatar_url are for others. The column
--      grants that close this are in the next migration, for deploy-order
--      reasons written down there.
--   2. notifyFriends was a broadcast to every approved user.
--   3. friendActivity / problemDetail returned unsplit full names.
--
-- UNAPPLIED. Apply this file BEFORE merging: everything in it is
-- backwards-compatible, because the policies here only bind the `authenticated`
-- role and the app's own queries run over the server connection, which bypasses
-- RLS. The one part that is NOT backwards-compatible - revoking columns on
-- `profiles` - was moved to 20260929000020_profiles_columns.sql, which must be
-- applied AFTER the deploy. See that file for why.
-- ===========================================================================

create extension if not exists citext;

-- ---------------------------------------------------------------------------
-- friend_invites
--
-- The row IS the request. Whether or not the invitee ever opens the email,
-- the pending row is what their dashboard lists and what they act on.
-- ---------------------------------------------------------------------------
create table public.friend_invites (
    id           uuid primary key default gen_random_uuid(),
    email        citext not null,
    invited_by   uuid not null references auth.users (id) on delete cascade,
    status       text not null default 'pending'
                   check (status in ('pending', 'accepted', 'revoked')),
    created_at   timestamptz not null default now(),
    responded_at timestamptz,
    -- dismissed_at: recipient hid it without refusing. Status stays 'pending';
    -- the sender sees no change and a link in hand still works. It just stops
    -- being listed.
    dismissed_at timestamptz,
    check ((status = 'pending') = (responded_at is null))
);

-- One live invite per sender per address.
-- `on conflict do nothing` is what makes a repeat invite a silent no-op.
create unique index friend_invites_pending_idx
    on public.friend_invites (invited_by, email) where status = 'pending';

-- Fast lookup when an approved user needs to see invites addressed to them.
create index friend_invites_email_idx on public.friend_invites (email) where status = 'pending';

-- ---------------------------------------------------------------------------
-- friendships
--
-- One row per pair, ordered so user_a < user_b. The check is the point: it
-- makes "A sees B but B does not see A" unrepresentable. Do not model this as
-- two directed rows.
-- ---------------------------------------------------------------------------
create table public.friendships (
    user_a     uuid not null references auth.users (id) on delete cascade,
    user_b     uuid not null references auth.users (id) on delete cascade,
    created_at timestamptz not null default now(),
    from_invite uuid references public.friend_invites (id) on delete set null,
    primary key (user_a, user_b),
    check (user_a < user_b)
);

-- ---------------------------------------------------------------------------
-- is_friend(other uuid) → boolean
--
-- Returns true for yourself, so every policy below reads the same way and no
-- caller needs an extra `or user_id = auth.uid()` clause.
-- SECURITY DEFINER: same reason is_approved() is — so it can read friendships
-- without tripping its own policies.
-- ---------------------------------------------------------------------------
create function public.is_friend(other uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select other = auth.uid() or exists (
    select 1 from public.friendships
    where (user_a = least(auth.uid(), other) and user_b = greatest(auth.uid(), other))
  );
$$;

-- The signed-in user's email. SECURITY DEFINER for the same reason: a policy
-- cannot read auth.users as the authenticated role — the first CI run failed
-- with "permission denied for table users" when it tried.
-- Returns text, and the POLICIES lower() both sides. That combination is
-- deliberate, and it took two wrong turns to get to.
--
-- `friend_invites.email` is citext, so `email = <text>` looks case-insensitive
-- and is not: citext->text is the IMPLICIT cast, text->citext is only
-- ASSIGNMENT, and operator resolution uses implicit casts only - so the
-- comparison resolves to text = text. An IdP storing First.Last@Corp.com would
-- have matched no invite, and check-rls could not see it because every address
-- in it is already lowercase.
--
-- Returning citext instead fixes the comparison and breaks the function: this is
-- `set search_path = ''` (as every security definer here is), and an unqualified
-- `citext` cannot be resolved with no search path. Schema-qualifying it would
-- mean asserting which schema the extension landed in, which differs between a
-- fresh `create extension` and a Supabase project that already had it.
--
-- So: no type name inside the locked search_path, and the case-folding moved to
-- the policies where the search path is normal. The cost is that
-- friend_invites_email_idx cannot serve those predicates; at this size that is
-- nothing, and correctness is not negotiable against it.
create function public.current_user_email() returns text
language sql stable security definer set search_path = ''
as $$
  select email::text from auth.users where id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Row-level security for the new tables
-- ---------------------------------------------------------------------------
alter table public.friend_invites enable row level security;
alter table public.friendships enable row level security;

-- You see invites you sent and invites addressed to your own email.
create policy friend_invites_read on public.friend_invites for select to authenticated
  using (invited_by = auth.uid() or lower(email::text) = lower(public.current_user_email()));

-- You can send an invite only when you are approved.
create policy friend_invites_send on public.friend_invites for insert to authenticated
  with check (invited_by = auth.uid() and public.is_approved());

-- You can respond (accept/refuse/dismiss) if the invite is addressed to you,
-- or revoke if you sent it. Column grants below stop a recipient rewriting
-- invited_by through this policy to forge a friendship with anyone.
create policy friend_invites_respond on public.friend_invites for update to authenticated
  using (lower(email::text) = lower(public.current_user_email()) or invited_by = auth.uid());

-- An update may only move status, responded_at and dismissed_at. Without this,
-- a recipient could set invited_by to another user's id and then accept, making
-- a friendship with someone who never invited them.
revoke update on public.friend_invites from authenticated;
grant update (status, responded_at, dismissed_at) on public.friend_invites to authenticated;

-- You see your own friendships and nobody else's.
create policy friendships_read on public.friendships for select to authenticated
  using (user_a = auth.uid() or user_b = auth.uid());

-- ---------------------------------------------------------------------------
-- Rewrite the six cross-user select policies to require friendship.
-- is_approved() stays in the conjunction: a pending or rejected account must
-- still see nothing even if a friendship row somehow exists.
-- ---------------------------------------------------------------------------
-- is_friend(user_id) already returns true for the owner's own row
-- (other = auth.uid()), so no separate `user_id = auth.uid()` branch is needed:
-- an approved owner reads their own rows through it, and a pending or rejected
-- account reads nothing at all — not even its own — because is_approved() is
-- still in the conjunction.
drop policy if exists checkins_read_approved on public.checkins;
create policy checkins_read_approved on public.checkins for select to authenticated
  using (public.is_approved() and public.is_friend(user_id));

drop policy if exists campaigns_read_approved on public.campaigns;
create policy campaigns_read_approved on public.campaigns for select to authenticated
  using (public.is_approved() and public.is_friend(user_id));

drop policy if exists days_read_approved on public.days;
create policy days_read_approved on public.days for select to authenticated
  using (public.is_approved() and public.is_friend(user_id));

drop policy if exists readiness_read_approved on public.readiness_snapshots;
create policy readiness_read_approved on public.readiness_snapshots for select to authenticated
  using (public.is_approved() and public.is_friend(user_id));

drop policy if exists mocks_read_approved on public.mocks;
create policy mocks_read_approved on public.mocks for select to authenticated
  using (public.is_approved() and public.is_friend(user_id));

-- profiles_read is different: the owner's own row is readable whatever their
-- approval, because the pending and setup screens need it. A friend's row still
-- needs is_approved(), so a de-approved former friend does not keep reading
-- names and avatars.
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (user_id = auth.uid() or (public.is_approved() and public.is_friend(user_id)));

-- ---------------------------------------------------------------------------
-- No backfill. It starts empty: nobody is anyone's friend on
-- day one and scoreboards go blank until people invite each other. Do not
-- "fix" this by inserting rows for existing approved pairs.
-- ---------------------------------------------------------------------------
