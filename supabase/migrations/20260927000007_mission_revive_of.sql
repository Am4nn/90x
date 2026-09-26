-- A revive mission is a missed day's leftover done as extra work today;
-- revive_of names that day so it can turn "revived" once all are done.
alter table public.missions add column revive_of date;
alter table public.missions add constraint missions_revive_consistent check (is_revive = (revive_of is not null));
