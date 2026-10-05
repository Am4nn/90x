-- ===========================================================================
-- Push delivery tracking
-- Until now a failed push left no trace: the send loop logged a bare status and
-- moved on, so "no notification ever arrived" could not be told apart from "the
-- job never ran". Each send now records its outcome on the subscription row, so
-- the admin page and the diagnostic script can see what the push service said.
--
--   last_ok_at     the push service accepted the last send (2xx)
--   last_error_at  the last send it refused or that failed
--   last_status    HTTP status of the most recent send (null = never sent)
--   last_error     short reason from the push service, trimmed to 200 chars
--   fail_count     consecutive failures; reset to 0 on success
--
-- Server written, over the server connection; the owner policy is unchanged.
-- ===========================================================================
alter table public.push_subscriptions
  add column last_ok_at    timestamptz,
  add column last_error_at timestamptz,
  add column last_status   int,
  add column last_error    text check (char_length(last_error) <= 200),
  add column fail_count    int not null default 0;
