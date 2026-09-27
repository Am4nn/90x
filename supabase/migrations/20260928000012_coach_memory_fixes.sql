-- Coach memory fixes.
--
-- last_seen_at: when new evidence last showed the fact. Habits age from it.
-- They used to age from updated_at, which the touch trigger bumps on every
-- status change, so "resolved after 28 quiet days" really took ~42.
--
-- expires_on: the date a goal or context stops being true ("Amazon onsite
-- Nov 20"). Past it, the weekly ageing resolves the fact.
--
-- 'dismissed': a fact the user deleted. The row stays (owner-only, like every
-- fact) so extraction doesn't learn it again; it is never shown or prompted.

alter table public.coach_memory
    add column last_seen_at timestamptz not null default now(),
    add column expires_on date;

update public.coach_memory set last_seen_at = updated_at;

alter table public.coach_memory drop constraint coach_memory_status_check;
alter table public.coach_memory
    add constraint coach_memory_status_check check (status in ('active', 'improving', 'resolved', 'dismissed'));
