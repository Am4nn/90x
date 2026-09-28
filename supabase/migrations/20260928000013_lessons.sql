-- The authored lesson layer.
--
-- A topic page shows its lesson instead of the `documents` text.

create table if not exists public.lessons (
    topic_slug   text primary key references public.topics (slug) on delete cascade,
    title        text not null,
    summary      text,
    body_md      text not null,
    -- problems and real interview questions this lesson unlocks, as
    -- {"problems": [slug], "questions": [slug]}
    practice     jsonb not null default '{}'::jsonb,
    source_refs  jsonb not null default '[]'::jsonb,
    words        integer,
    generated_at timestamptz,
    created_at   timestamptz not null default now()
);

create index if not exists lessons_title_idx on public.lessons (title);

alter table public.lessons enable row level security;

-- Every approved user reads every lesson; nobody writes through the API.
drop policy if exists lessons_read on public.lessons;
create policy lessons_read on public.lessons
    for select to authenticated using (public.is_approved());
