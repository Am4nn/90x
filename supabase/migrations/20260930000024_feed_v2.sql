-- ===========================================================================
-- FEED v2 : a card carries its archetype, its deterministic answer,
-- and the observed outcomes the difficulty calibration will write.
--
-- Purely additive. No column is dropped and no existing row is rewritten.
-- The structured answer is stored serialised as JSON in card_reviews.answer
-- (text) later; the columns below hold the *expected* answer on the card.
-- ===========================================================================

-- cards.format becomes the primitive id going forward; the old enum is a dead
-- letter. Drop the check so the column can hold primitive ids.
alter table public.cards drop constraint if exists cards_format_check;

alter table public.cards
  add column archetype   text,              -- id from archetypes.json
  add column picked      jsonb,             -- correct indices, shape "chosen"
  add column constraints jsonb,             -- ordering constraints, shape "ordered"
  add column pairs       jsonb,             -- one-to-one [[l,r],...], shape "mapping"
  add column value       double precision,  -- expected number, shape "number"
  add column tolerance   double precision,  -- |given - expected| <= tolerance
  add column why_step    jsonb,             -- { options: string[], correct: number } | null
  add column observed_attempts integer not null default 0,
  add column observed_correct integer not null default 0;

-- The Feed's deterministic graders write "pure"; keep the old values for
-- legacy rows. card_reviews.graded_by already allows these six; this only adds
-- "pure" to the set.
alter table public.card_reviews drop constraint if exists card_reviews_graded_by_check;
alter table public.card_reviews add constraint card_reviews_graded_by_check
  check (graded_by = any (array['pure','self','skip','declared','match','ai','options']));
