-- Lessons the Coach wrote on demand.
--
-- The Coach can be asked something no lesson covers. Rather than answer from
-- the model's own memory, it writes a lesson - checked against its structural
-- contract and grounded in a search that must find material first - and
-- stores it here beside the catalog's.
--
-- `written_by` marks such a lesson; the check-coach-tools script covers it.
--
-- Null means a catalog lesson, which is every existing row.

alter table public.lessons
    add column if not exists written_by uuid references auth.users (id) on delete set null;

-- Small and sparse: the only query is "is this one the catalog's?".
create index if not exists lessons_written_by_idx
    on public.lessons (written_by) where written_by is not null;

comment on column public.lessons.written_by is
    'The user whose Coach wrote this lesson on demand. Null means a catalog lesson.';

-- No insert or update policy, deliberately. The Coach writes over the server
-- connection, which bypasses RLS; `authenticated` still cannot write a lesson
-- through the API, which is what the read-only policy from
-- 20260928000013_lessons.sql already assumed.
