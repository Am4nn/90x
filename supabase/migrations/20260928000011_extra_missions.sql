-- Missions added outside the template (Coach's add_mission, "Queue next
-- problem" from a solution review or lesson) are extra: they still count for
-- readiness when done, but never reopen a finished day or cost a streak.
alter table public.missions add column is_extra boolean not null default false;
