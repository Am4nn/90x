-- A day with nothing countable planned (catalog empty, cards-only template)
-- is a rest day: no X, and it neither extends nor breaks the streak.
alter table public.days drop constraint days_status_check;
alter table public.days add constraint days_status_check
  check (status in ('pending', 'done', 'partial', 'missed', 'revived', 'rest'));
