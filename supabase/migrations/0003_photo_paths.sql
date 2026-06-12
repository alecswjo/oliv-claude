-- Multi-photo meals (up to 5 photos per meal). `photo_paths` supersedes the
-- single `photo_path`; the old column is kept readable for back-compat and
-- folded into the array here.

alter table meals add column if not exists photo_paths text[] not null default '{}';

update meals
set photo_paths = array[photo_path]
where photo_path is not null and photo_paths = '{}';
