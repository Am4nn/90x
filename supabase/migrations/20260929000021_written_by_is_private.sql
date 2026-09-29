-- ===========================================================================
-- lessons.written_by is nobody else's business
--
-- `lessons_read` is `is_approved()`, because every approved user reads every
-- lesson - that part is right. But 20260929000018 added `written_by`, so the
-- whole table now carries a user id, and a `select written_by from lessons`
-- told any approved user that a particular person exists and which topic they
-- asked the Coach about. That is exactly the discoverability the friends change
-- exists to remove, reintroduced by a column added for an unrelated reason.
--
-- The app never reads it as the authenticated role: the Coach runs over the
-- server connection, which bypasses RLS and column grants.
--
-- Same shape as the profiles grants in 20260929000020: revoke the table, grant
-- the columns. Adding a lesson column in future means adding it here too, which
-- is the cost of a column allow-list and is preferable to a deny-list that
-- silently exposes whatever is added next.
-- ===========================================================================

revoke select on public.lessons from authenticated;
grant select (topic_slug, title, summary, body_md, practice, source_refs, words, generated_at, created_at)
  on public.lessons to authenticated;
