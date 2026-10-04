-- ===========================================================================
-- CARD RATINGS
-- A reader's one-to-five star rating of a card, kept private to them and the
-- admin. One row per reader per card: rating again replaces it, tapping the
-- chosen star again clears it (the row is deleted). The admin card view reads
-- these as Good (4-5), Normal (3) and Bad (1-2), beside the existing reports.
--
-- Purely additive. The app tolerates the table being absent: a failed rating
-- shows an inline error and never blocks the next card.
-- ===========================================================================
create table public.card_ratings (
    user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
    card_id    uuid not null references public.cards (id) on delete cascade,
    stars      smallint not null check (stars between 1 and 5),
    updated_at timestamptz not null default now(),
    primary key (user_id, card_id)
);
create index card_ratings_card_idx on public.card_ratings (card_id);

alter table public.card_ratings enable row level security;
create policy card_ratings_owner on public.card_ratings for all to authenticated
  using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() and public.is_approved());
