-- Meal tombstones: fix delete-resurrection across surfaces.
--
-- The app is local-first: hydrateForUser re-pushes meals the server doesn't
-- have (healing offline logs). But when the texting agent deletes a meal
-- server-side, the app's cached copy looks exactly like an unsynced local meal
-- and gets pushed back — resurrecting it (observed live, 2026-07-24).
--
-- Fix: record every meal deletion; block re-inserts of tombstoned ids at the
-- database level; let clients read their own tombstones so hydrate/refresh can
-- drop stale local copies instead of re-pushing them.

create table if not exists deleted_meals (
  id         uuid primary key,
  user_id    uuid,
  deleted_at timestamptz not null default now()
);
alter table deleted_meals enable row level security;
drop policy if exists deleted_meals_select on deleted_meals;
create policy deleted_meals_select on deleted_meals
  for select using (user_id = auth.uid());
-- writes: triggers only

create or replace function record_meal_tombstone() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into deleted_meals (id, user_id) values (old.id, old.user_id)
  on conflict (id) do nothing;
  return old;
end $$;
drop trigger if exists meals_tombstone on meals;
create trigger meals_tombstone after delete on meals
  for each row execute function record_meal_tombstone();

create or replace function block_meal_resurrection() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from deleted_meals where id = new.id) then
    return null; -- deleted on another surface: silently skip the re-insert
  end if;
  return new;
end $$;
drop trigger if exists meals_block_resurrection on meals;
create trigger meals_block_resurrection before insert on meals
  for each row execute function block_meal_resurrection();
