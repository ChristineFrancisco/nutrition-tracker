-- ============================================================
-- Storage bucket for food photos.
-- Run AFTER 0001_initial_schema.sql.
-- Bucket is private; access is always via signed URLs from the server.
-- ============================================================

-- Create the bucket (no-op if it already exists).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'food-photos',
  'food-photos',
  false,
  10485760,
  '{image/jpeg,image/png,image/webp,image/heic}'
)
on conflict (id) do nothing;

-- Users can manage only objects under their own user-id prefix.
-- We'll store paths like "<user_id>/<entry_id>.jpg".
drop policy if exists "food-photos: owner read"   on storage.objects;
drop policy if exists "food-photos: owner write"  on storage.objects;
drop policy if exists "food-photos: owner update" on storage.objects;
drop policy if exists "food-photos: owner delete" on storage.objects;

create policy "food-photos: owner read"
  on storage.objects for select
  using (
    bucket_id = 'food-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "food-photos: owner write"
  on storage.objects for insert
  with check (
    bucket_id = 'food-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "food-photos: owner update"
  on storage.objects for update
  using (
    bucket_id = 'food-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'food-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "food-photos: owner delete"
  on storage.objects for delete
  using (
    bucket_id = 'food-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
