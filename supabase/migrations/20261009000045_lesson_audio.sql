-- ===========================================================================
-- AUDIO LESSONS: one rendered file per lesson, and each person's listening position.
--
-- lesson_audio is content, like lessons. No URL is stored: the file
-- lives in a private R2 bucket and the app signs a 12-hour GET per play (web/src/lib/audio/sign.ts).
-- `lines` is the transcript with per-line timings. The row goes with its lesson.
--
-- lesson_audio_progress is one row per person per lesson: where they are, the speed they chose,
-- and when they finished (95% listened). Written only by the server action, scoped to the
-- verified viewer; read only over the server connection.
--
-- Grants: none. The browser reaches no app table (042); only the app server reads and writes
-- these, connecting as the table owner. RLS is on with no policy, so even a future grant reads
-- nothing until a policy says otherwise.
--
-- Locks: new tables only; nothing existing is rewritten. lock_timeout keeps the FK validation
-- on lessons and auth.users from queueing behind a long transaction.
-- ===========================================================================

set local lock_timeout = '5s';

create table if not exists public.lesson_audio (
  topic_slug   text primary key references public.lessons(topic_slug) on delete cascade,
  r2_key       text not null,
  duration_s   double precision not null,
  bytes        bigint not null,
  script_hash  text not null,
  voice        text not null,
  lines        jsonb not null default '[]'::jsonb,
  published_at timestamptz not null default now()
);
alter table public.lesson_audio enable row level security;

create table if not exists public.lesson_audio_progress (
  user_id     uuid not null references auth.users(id) on delete cascade,
  topic_slug  text not null references public.lessons(topic_slug) on delete cascade,
  position_s  double precision not null default 0,
  rate        real not null default 1,
  finished_at timestamptz,
  updated_at  timestamptz not null default now(),
  primary key (user_id, topic_slug)
);
alter table public.lesson_audio_progress enable row level security;
-- "Resume" on the lesson page and the remembered speed both read one person's newest rows.
create index if not exists lesson_audio_progress_user_updated_idx
  on public.lesson_audio_progress (user_id, updated_at desc);
