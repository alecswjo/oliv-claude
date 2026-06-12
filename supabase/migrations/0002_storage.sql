-- Meal photo storage. Photos are stored at `<user_id>/<meal_id>.jpg`.
-- Bucket is public-read (feed images load without signed URLs); writes are
-- restricted to the authenticated owner's own folder.

insert into storage.buckets (id, name, public)
values ('meal-photos', 'meal-photos', true)
on conflict (id) do nothing;

-- public read
drop policy if exists meal_photos_read on storage.objects;
create policy meal_photos_read on storage.objects for select
  using (bucket_id = 'meal-photos');

-- owner-only write/update/delete, scoped to a folder named after the user id
drop policy if exists meal_photos_insert on storage.objects;
create policy meal_photos_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'meal-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists meal_photos_update on storage.objects;
create policy meal_photos_update on storage.objects for update to authenticated
  using (
    bucket_id = 'meal-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists meal_photos_delete on storage.objects;
create policy meal_photos_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'meal-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
