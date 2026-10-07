-- ===========================================================================
-- Counters for the admin Analytics page.
--
-- share_codes.shared_count: times the owner shared, copied or downloaded their
--   card from the share row (a server action, capped per person per day).
-- share_codes.views: origin renders of the public card image /api/share/<code>.
--   The route is edge-cached (s-maxage=900), so a CDN hit is not counted, and
--   the sharer's own versioned fetch (?v=) is left out.
-- topic_opens.open_count / last_opened_at: a lesson opened again (a minute in
--   view on a later visit) bumps these. opened_at stays the first open.
--
-- Purely additive: defaults fill every existing row, and the app's existing
-- writes keep working without naming the new columns.
-- ===========================================================================

-- Each ALTER takes an ACCESS EXCLUSIVE lock (and the CHECKs scan the table under it). If a long
-- transaction (the nightly dump, a slow query) already holds a lock, fail fast and retry instead of
-- queueing every card and lesson read behind this migration.
set local lock_timeout = '5s';

alter table public.share_codes
  add column shared_count int not null default 0 check (shared_count >= 0),
  add column views        int not null default 0 check (views >= 0);

alter table public.topic_opens
  add column open_count     int not null default 1 check (open_count >= 1),
  add column last_opened_at timestamptz;

-- topic_opens is written only over the server connection (lib/tracker/service.ts, markOpened). With
-- counters on it, a reader must not be able to write their own rows over the API, the same as
-- share_codes and xp_events. The owner can still read their rows through the existing policy.
revoke insert, update, delete on public.topic_opens from anon, authenticated;

-- Studied implies opened (see 20261005000028): give every studied lesson that has no open its open,
-- dated when it was studied, so a reader's next visit is a re-open and not a first open counted today.
insert into public.topic_opens (user_id, topic_slug, opened_at)
select tp.user_id, tp.topic_slug, tp.studied_at from public.topic_progress tp
on conflict (user_id, topic_slug) do nothing;
