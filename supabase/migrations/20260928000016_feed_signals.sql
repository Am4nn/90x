-- Two things a card cannot work out for itself.
--
-- The Feed serves about 20% never-answered cards and about 50% from weak
-- areas, and nothing checked whether the reader had ever studied the topic.
-- So a card could be someone's first encounter with an idea, which makes it
-- a guess rather than recall - and for multiple choice, a forced wrong
-- commitment before any basis for choosing.
--
-- Inferring this from topic_progress does not work: it records what was
-- studied inside 90x and knows nothing about the Java someone has written
-- for a decade. Only the reader knows. So they tell us.
--
--   new_to_me : "I have not met this yet." Reveals the answer and the lesson,
--               scores nothing, and records a gap the planner and coach can act on.
--   known     : "I knew this already." Retires the card from the rotation.
--               Only offered once the reader has a real success record on the
--               topic, so it cannot be used to skip what they half-know.

alter table public.card_reviews drop constraint if exists card_reviews_outcome_check;
alter table public.card_reviews add constraint card_reviews_outcome_check
    check (outcome = any (array['correct', 'wrong', 'skipped', 'new_to_me', 'known']));

-- Both are the reader's own judgement, not a grade we computed.
alter table public.card_reviews drop constraint if exists card_reviews_graded_by_check;
alter table public.card_reviews add constraint card_reviews_graded_by_check
    check (graded_by = any (array['match', 'ai', 'self', 'options', 'skip', 'declared']));

-- Finding a user's declared gaps is a lookup the coach and the planner both
-- make, and it is always "the newest signal per topic".
create index if not exists card_reviews_declared_idx
    on public.card_reviews (user_id, outcome, created_at desc)
    where outcome in ('new_to_me', 'known');
