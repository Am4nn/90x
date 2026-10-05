-- ===========================================================================
-- Where a person came from, for the admin Analytics page.
-- The proxy keeps a short first-party cookie (source, medium, campaign,
-- referrer host) for a visitor who arrives with a utm_* parameter or from another
-- site; the sign-in callback copies it here once, then clears it.
--
--   signup_source    utm_source, else the referrer host, else 'direct'
--                    (null = before this existed, or never captured)
--   signup_medium    utm_medium
--   signup_campaign  utm_campaign
--   signup_referrer  the Referer host
--
-- Purely additive and nullable. No new policy: the existing profile rules cover
-- the new columns, and the page reads only counts by source, never a person.
-- ===========================================================================
alter table public.profiles
    add column signup_source   text,
    add column signup_medium   text,
    add column signup_campaign text,
    add column signup_referrer text;
