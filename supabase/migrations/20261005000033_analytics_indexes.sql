-- ===========================================================================
-- Time-first indexes for the admin Analytics page.
-- The page asks "what happened in the last 7/30/90 days, across everyone", and the
-- existing indexes all lead with user_id or a parent id, so those scans would read
-- whole tables as they grow. Each index here lets the range be read directly.
-- Additive and cheap on tables this size; nothing in the app reads them.
-- ===========================================================================
create index card_reviews_created_idx on public.card_reviews (created_at);
create index coach_messages_user_created_idx on public.coach_messages (created_at) where role = 'user';
create index checkins_created_idx on public.checkins (created_at);
create index mocks_started_idx on public.mocks (started_at);
create index problem_reviews_updated_idx on public.problem_reviews (updated_at);
create index missions_date_idx on public.missions (date);
