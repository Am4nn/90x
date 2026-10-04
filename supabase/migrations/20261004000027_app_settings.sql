-- ===========================================================================
-- APP SETTINGS
-- Switches and caps the admin changes without a deploy: whether new sign-ins
-- are approved automatically, the AI spend caps, the hard stop and the pause
-- switch. One row per setting, the value as JSON; the app falls back to a
-- default for any key that is missing or malformed.
--
-- Server only. The app reads and writes it over the server connection after an
-- admin check, so row-level security is on with no policies and the API roles
-- get no privileges at all.
--
-- Purely additive: the app tolerates the table being absent (defaults apply).
-- ===========================================================================
create table public.app_settings (
    key        text primary key,
    value      jsonb not null,
    updated_by uuid references auth.users (id) on delete set null,
    updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;
revoke all on public.app_settings from anon, authenticated;
