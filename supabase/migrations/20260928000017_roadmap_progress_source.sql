-- Where a roadmap tick came from.
--
-- Studying a topic ticks its linked nodes, and undoing that study unticks
-- them. Without this column the undo also deleted boxes the reader had ticked
-- by hand, because both were the same row: they would lose a check they never
-- asked to remove.

alter table public.roadmap_progress
    add column if not exists source text not null default 'manual'
    check (source in ('manual', 'topic'));
