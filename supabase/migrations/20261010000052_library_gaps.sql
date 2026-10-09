-- ===========================================================================
-- LIBRARY_GAPS: topics people asked Coach about that the Library does not cover.
--
-- Coach's note_library_gap tool (lib/coach/gaps.ts) adds a row, or counts one more ask on the
-- row that is there. topic is a short normalized phrase (lowercase, 2 to 80 characters), never
-- the message it came from. topic_slug is set when the phrase matches a taxonomy topic; it has
-- no foreign key, so a removed topic leaves the row readable. Read by /admin/reports, where the
-- admin sees what the Library should cover next and clears a row once it does.
-- No user id is stored, so account deletion has nothing to remove here.
-- Written and read only by the app server; no client grants (042 closed the Data API).
-- Locks: a new table takes no lock anyone waits on.
-- ===========================================================================
create table public.library_gaps (
    topic          text primary key check (char_length(topic) between 2 and 80),
    topic_slug     text,
    asks           int not null default 1 check (asks >= 1),
    first_asked_at timestamptz not null default now(),
    last_asked_at  timestamptz not null default now()
);
alter table public.library_gaps enable row level security;
revoke all on public.library_gaps from anon, authenticated;
