-- ===========================================================================
-- cards.published_at: when this card was last published.
--
-- Only cards that carry the newest stamp are active, so a card retired on purpose
-- stays retired.
--
-- Purely additive and nullable.
-- ===========================================================================

alter table public.cards add column published_at timestamptz;

comment on column public.cards.published_at is
  'When this card was last published. Only the newest stamp is active.';
