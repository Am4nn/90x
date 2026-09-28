-- Documents leave the app database.
--
-- The `lessons` table replaces them everywhere a person reads, and Coach's
-- retrieval uses the vector index. Nothing in the app queries this table
-- any more.

alter table public.cards drop column if exists document_id;
drop table if exists public.documents;
