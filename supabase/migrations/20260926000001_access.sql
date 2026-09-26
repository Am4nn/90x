-- ===========================================================================
-- ACCESS CONTROL
-- Invite-only, the same way Curfew does it:
--   1. Google sign-in creates an auth.users row.
--   2. A trigger creates a profile and a PENDING approval for it.
--   3. Pending users see a waiting screen and no data. An admin approves or
--      rejects them in /admin. The first admin is set with `bun run admin:grant`.
-- ===========================================================================

create table public.profiles (
    user_id           uuid primary key references auth.users (id) on delete cascade,
    name              text not null default '',
    avatar_url        text,
    role              text,
    language          text check (language in ('java', 'python', 'cpp', 'javascript')),
    timezone          text not null default 'Asia/Kolkata',
    campaign_days     int check (campaign_days between 7 and 365),
    leetcode_username text,
    notifications     jsonb not null default '{}'::jsonb,
    setup_done_at     timestamptz,
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now()
);

create table public.user_approvals (
    user_id      uuid primary key references auth.users (id) on delete cascade,
    status       text not null default 'pending'
                   check (status in ('pending', 'approved', 'rejected')),
    is_admin     boolean not null default false,
    requested_at timestamptz not null default now(),
    decided_at   timestamptz,
    decided_by   uuid references auth.users (id),
    check ((status = 'pending') = (decided_at is null))
);

-- Helpers used by every policy. SECURITY DEFINER so they can read
-- user_approvals without tripping its own policies.
create function public.is_approved() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.user_approvals
    where user_id = auth.uid() and status = 'approved'
  );
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.user_approvals
    where user_id = auth.uid() and status = 'approved' and is_admin
  );
$$;

-- New auth user → profile + pending approval.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (user_id, name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  insert into public.user_approvals (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.touch_updated_at() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

alter table public.profiles enable row level security;
alter table public.user_approvals enable row level security;

-- Profiles: approved users see each other; everyone edits only their own.
create policy profiles_read on public.profiles for select to authenticated
  using (user_id = auth.uid() or public.is_approved());
create policy profiles_update_own on public.profiles for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Approvals: you see your own row; admins see and decide all rows.
create policy approvals_read on public.user_approvals for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy approvals_decide on public.user_approvals for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
