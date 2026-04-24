-- 0007: Add entry_type to distinguish photo entries from text-only entries.
--
-- Up to now every entry had a photo_path at creation time, even if the
-- photo later got cleaned up. We're introducing a text-only path where
-- the user describes a meal and never uploads a photo, so we need an
-- explicit marker that analyzeEntry can branch on.
--
-- Default 'photo' so existing rows don't need a data migration — they
-- were all photo entries by definition.

alter table public.entries
  add column if not exists entry_type text not null default 'photo'
    check (entry_type in ('photo', 'text'));
