-- ===========================================================================
-- CHECK-IN NOTES, SPLIT OUT
-- The first version hid notes from friends with a view running on its
-- owner's rights, which Supabase's advisor rightly flags. Notes now live in
-- their own owner-only table, so check-ins themselves carry nothing private
-- and approved users can read them under plain RLS.
-- ===========================================================================

create table public.checkin_notes (
    checkin_id uuid primary key references public.checkins (id) on delete cascade,
    user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
    note       text not null,
    updated_at timestamptz not null default now()
);

insert into public.checkin_notes (checkin_id, user_id, note)
  select id, user_id, note from public.checkins where note is not null;

drop view public.checkins_public;
alter table public.checkins drop column note;

alter table public.checkin_notes enable row level security;

-- The note's user must own the check-in it is attached to.
create policy checkin_notes_owner on public.checkin_notes for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.checkins c where c.id = checkin_id and c.user_id = auth.uid())
  );

create trigger checkin_notes_touch before update on public.checkin_notes
  for each row execute function public.touch_updated_at();

-- Friends read check-ins directly now (nothing private left in the row).
create policy checkins_read_approved on public.checkins for select to authenticated
  using (public.is_approved());
