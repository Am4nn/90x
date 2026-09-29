-- ===========================================================================
-- friendships: the client never writes it, so stop letting it try
--
-- RLS already denies every write on this table - there is no INSERT, UPDATE or
-- DELETE policy - but Supabase's default privileges left `anon` and
-- `authenticated` holding all three, so the only thing standing between a forged
-- friendship and the table was a missing policy. `friendships` is written only by
-- accept() and unfriend() over the server connection (the table owner), and
-- nothing in web/src writes it through the Supabase client, so the grants can go.
--
-- Now a client write has to get past both a privilege it does not hold and a
-- policy that does not exist. SELECT is untouched: friendships_read is what lets a
-- signed-in user read their own pairs.
-- ===========================================================================

revoke insert, update, delete on public.friendships from anon, authenticated;
