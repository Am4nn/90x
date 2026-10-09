-- ===========================================================================
-- COACH_THREADS.KIND 'add': the day's "Add with Coach" thread on Today.
--
-- Never listed in Coach history (threads.listThreads filters it); its messages
-- feed Coach memory like a chat. Grants unchanged (nothing to anon/authenticated).
-- ===========================================================================
alter table public.coach_threads drop constraint if exists coach_threads_kind_check;
alter table public.coach_threads
    add constraint coach_threads_kind_check check (kind in ('chat', 'lesson', 'review', 'mock', 'add'));
