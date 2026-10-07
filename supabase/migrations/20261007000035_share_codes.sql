-- ===========================================================================
-- Share codes: one public code per user, for the share card and the invite link.
--
-- The code is the only thing a public URL carries (/api/share/<code>, and the
-- utm_campaign of the invite link). It maps to a user only on the server
-- connection, which bypasses RLS, so nobody can list codes or find a user's.
-- Each person can read only their own row, and only once approved; the server writes it.
--
-- Purely additive.
-- ===========================================================================
create table public.share_codes (
    user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
    code       text not null unique check (code ~ '^[a-z0-9]{8}$'),
    created_at timestamptz not null default now()
);

alter table public.share_codes enable row level security;
revoke all on public.share_codes from anon;

-- Owner: read their own code (approved users only). No write policy at all.
create policy share_codes_owner_read on public.share_codes for select to authenticated
  using (user_id = auth.uid() and public.is_approved());

-- Belt and braces, as for xp_events: the app writes only over the server connection, and a
-- client write fails on a privilege it does not hold before RLS is even consulted.
revoke insert, update, delete on public.share_codes from authenticated;
