-- ===========================================================================
-- DATABASE REVIEW FIXES (items 2-6)
--
-- 1. Deleting a catalog row (problem, card) can no longer erase anyone's learning
--    history: those foreign keys become RESTRICT, so such a delete fails loudly.
-- 2. Two missing indexes: friendships(user_b), cards(problem_slug).
-- 3. cards.format and profiles.timezone are checked by the database again.
-- 4. ai_usage.cost_usd becomes exact (numeric), because it is the AI budget's ledger.
-- 5. Audit columns that name an admin stop blocking that admin's deletion.
--
-- Safe to run twice: every constraint is dropped if it exists and added again,
-- indexes are `if not exists`, functions `create or replace`.
--
-- Locks, for production: one transaction, every lock held until COMMIT. Dropping a
-- foreign key takes ACCESS EXCLUSIVE on BOTH tables (it removes the RI triggers on the
-- referenced one too), so problems, cards and auth.users are locked exclusively, not
-- just the tables that change. To keep that short and deadlock-free:
--   - every public table this file alters is locked up front in one LOCK statement,
--     in a fixed order, so the migration never holds some of them while waiting for
--     another that a live transaction (an answer, a check-in) already holds;
--   - the three FKs to auth.users go last, so Supabase Auth (sign-in, token refresh)
--     is locked only for the final few statements.
-- Every table is small (tens of users, a few thousand cards): the whole file runs in
-- about half a second, which is how long the Feed, the Library and sign-in stall.
-- lock_timeout makes it give up after 5 s instead of queueing behind a long query
-- (a queued ACCESS EXCLUSIVE request stalls every query after it); re-run it then.
-- ===========================================================================
begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

lock table
  public.cards, public.problems,
  public.card_reviews, public.card_state, public.card_ratings, public.card_flags,
  public.checkins, public.problem_reviews, public.solution_reviews,
  public.user_approvals, public.card_batches, public.batch_review_items,
  public.friendships, public.profiles, public.ai_usage
  in access exclusive mode;

-- ---------------------------------------------------------------------------
-- 1. Learning history that points at the catalog: ON DELETE RESTRICT.
-- These cascaded, so deleting a problem or a card (or a batch, which cascades to
-- its cards) silently deleted people's check-ins, review ladders, answers and FSRS
-- schedules. Catalog rows are retired with `status`/`hidden`, never deleted while
-- someone has history on them, and now the database enforces that.
--
-- A catalog row with history is hidden or retired (status), never deleted; only
-- retired cards with no history are deleted. The break-in teardown deletes its
-- users first, then its content.
--
-- Left as CASCADE on purpose:
--   cards.batch_id, cards.problem_slug, batch_review_items.*  catalog/admin rows
--     about the catalog; the RESTRICT below still stops the chain at any history.
--   topic_progress, topic_opens, roadmap_progress  "studied/opened/ticked" marks on
--     the taxonomy. Topics and roadmap nodes change with the taxonomy; holding
--     every topic someone once opened would leave stale topics in the Library for
--     good, and a mark is one tap to redo.
-- ---------------------------------------------------------------------------
alter table public.checkins drop constraint if exists checkins_problem_slug_fkey;
alter table public.checkins add constraint checkins_problem_slug_fkey
  foreign key (problem_slug) references public.problems (slug) on delete restrict;

alter table public.problem_reviews drop constraint if exists problem_reviews_problem_slug_fkey;
alter table public.problem_reviews add constraint problem_reviews_problem_slug_fkey
  foreign key (problem_slug) references public.problems (slug) on delete restrict;

alter table public.solution_reviews drop constraint if exists solution_reviews_problem_slug_fkey;
alter table public.solution_reviews add constraint solution_reviews_problem_slug_fkey
  foreign key (problem_slug) references public.problems (slug) on delete restrict;

alter table public.card_reviews drop constraint if exists card_reviews_card_id_fkey;
alter table public.card_reviews add constraint card_reviews_card_id_fkey
  foreign key (card_id) references public.cards (id) on delete restrict;

alter table public.card_state drop constraint if exists card_state_card_id_fkey;
alter table public.card_state add constraint card_state_card_id_fkey
  foreign key (card_id) references public.cards (id) on delete restrict;

alter table public.card_ratings drop constraint if exists card_ratings_card_id_fkey;
alter table public.card_ratings add constraint card_ratings_card_id_fkey
  foreign key (card_id) references public.cards (id) on delete restrict;

alter table public.card_flags drop constraint if exists card_flags_card_id_fkey;
alter table public.card_flags add constraint card_flags_card_id_fkey
  foreign key (card_id) references public.cards (id) on delete restrict;

-- ---------------------------------------------------------------------------
-- 2. Indexes.
-- friendships' primary key leads with user_a, so "friends of X" on the user_b side
-- (is_friend(), the friends list) scanned the table. cards.problem_slug is joined on
-- by the Feed and Library, and checked on every problem delete.
-- ---------------------------------------------------------------------------
create index if not exists friendships_user_b_idx on public.friendships (user_b);
create index if not exists cards_problem_slug_idx on public.cards (problem_slug);

-- ---------------------------------------------------------------------------
-- 3a. cards.format: the allowed values again.
-- 024 dropped the old five-value check so the column could hold primitive ids.
-- Allowed now: the ten primitives in archetypes.json (src/lib/feed/archetypes.ts
-- PRIMITIVES; a unit test keeps this list in step), `self_rate` (a retired
-- primitive that old rows still carry and the Feed filters out), and the five
-- legacy chunk formats on retired cards. NOT VALID then VALIDATE: if production holds
-- a value outside the list, VALIDATE fails and the whole migration rolls back.
-- ---------------------------------------------------------------------------
alter table public.cards drop constraint if exists cards_format_check;
alter table public.cards add constraint cards_format_check check (format in (
  'pick_one', 'order', 'match', 'bucket', 'tap_in_place', 'assemble', 'numeric',
  'claim_grid', 'grid_toggle', 'compose',
  'self_rate',
  'typed', 'flash', 'mcq', 'output', 'bug'
)) not valid;
alter table public.cards validate constraint cards_format_check;

-- ---------------------------------------------------------------------------
-- 3b. profiles.timezone must be a time zone this server knows.
-- Every "today" in SQL is `... at time zone <profiles.timezone>`, so one bad name
-- breaks every page for that person. Not a CHECK constraint: a CHECK must be
-- immutable, and whether a name is valid depends on the server's tz database, which
-- changes with Postgres upgrades. Declaring it IMMUTABLE anyway would be a lie that
-- can fail a restore (pg_dump re-checks CHECKs while loading rows) the day a name is
-- dropped. A trigger checks only the writes, which is the guard wanted here, and
-- raises the same error code a CHECK would (23514).
-- pg_timezone_names lists full names only (Asia/Kolkata, UTC), not abbreviations
-- or POSIX offsets, which the browser never sends and the app should not store.
-- The lookup lives inside the trigger function rather than in a helper: a plain
-- function in public would be callable by anyone through /rest/v1/rpc, and each
-- call reads the tz directory (~70 ms). A trigger function cannot be called that way.
-- ---------------------------------------------------------------------------
create or replace function public.profiles_timezone_valid()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Reading pg_timezone_names lists the tz directory (~70 ms), so only pay it when
  -- the value actually changes; the column is written on setup and settings only.
  if tg_op = 'UPDATE' and new.timezone is not distinct from old.timezone then
    return new;
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names n where n.name = new.timezone) then
    raise exception 'invalid time zone: %', new.timezone
      using errcode = 'check_violation', constraint = 'profiles_timezone_valid';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_timezone_valid on public.profiles;
create trigger profiles_timezone_valid
  before insert or update of timezone on public.profiles
  for each row execute function public.profiles_timezone_valid();

-- The trigger does not look at rows already there, so check them once here.
do $$
declare
  bad text;
begin
  -- One anti-join against the zone list, not a function call per row: the filter
  -- would be pushed below the DISTINCT and read the tz directory once per profile.
  select string_agg(d.tz, ', ') into bad
  from (select distinct timezone as tz from public.profiles) d
  where not exists (select 1 from pg_catalog.pg_timezone_names n where n.name = d.tz);
  if bad is not null then
    raise exception 'profiles hold invalid time zones: %', bad;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. ai_usage.cost_usd: exact decimals.
-- Budget totals are sums over this column; double precision drifts on every add.
-- Six decimals is a millionth of a dollar, below the cost of a single token.
-- ---------------------------------------------------------------------------
alter table public.ai_usage alter column cost_usd type numeric(10, 6) using cost_usd::numeric(10, 6);

-- ---------------------------------------------------------------------------
-- 5. Admin audit columns: ON DELETE SET NULL. Last, so auth.users is locked last.
-- These three had no rule, so deleting a user who had ever approved someone or
-- reviewed a card batch failed, and account deletion had to null them by hand.
-- The decision stays on record; only the name of who made it goes.
-- problems.source_id -> sources keeps NO ACTION on purpose: it is not a user, and a
-- source that problems still cite must not disappear underneath them.
-- ---------------------------------------------------------------------------
alter table public.user_approvals drop constraint if exists user_approvals_decided_by_fkey;
alter table public.user_approvals add constraint user_approvals_decided_by_fkey
  foreign key (decided_by) references auth.users (id) on delete set null;

alter table public.card_batches drop constraint if exists card_batches_reviewed_by_fkey;
alter table public.card_batches add constraint card_batches_reviewed_by_fkey
  foreign key (reviewed_by) references auth.users (id) on delete set null;

alter table public.batch_review_items drop constraint if exists batch_review_items_decided_by_fkey;
alter table public.batch_review_items add constraint batch_review_items_decided_by_fkey
  foreign key (decided_by) references auth.users (id) on delete set null;

commit;
