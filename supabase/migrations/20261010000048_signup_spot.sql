-- ===========================================================================
-- PROFILES.SIGNUP_SPOT: which sign-in button a new account was created from.
--
-- 'hero', 'close', 'try' or 'maintenance'. Kept apart from signup_source (first-touch
-- source, never overwritten): the button pressed is a different fact. Written once by the
-- sign-in callback on a new profile, from a one-hour cookie; null for older accounts and
-- for sign-ins that did not come from a button. Read by admin Analytics ("The demo").
-- Locks: adding a nullable column with a check takes a brief ACCESS EXCLUSIVE lock on
-- profiles; no table rewrite. Grants on profiles are unchanged.
-- ===========================================================================
alter table public.profiles
    add column signup_spot text check (signup_spot in ('hero','close','try','maintenance'));
