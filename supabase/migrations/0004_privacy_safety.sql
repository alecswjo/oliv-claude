-- Privacy hardening + trust & safety + analyzer quotas.
--
-- 1. profiles carried sex/age/height/weight (`body`) and calorie goals in a
--    world-readable row. Rows become owner-only; everyone else reads the
--    `public_profiles` projection (no health data).
-- 2. profile_stats ran with owner rights (security definer by default) and
--    leaked private-meal counts/averages. Rebuilt as security-invoker over
--    the public projection, so meals RLS applies to the caller.
-- 3. security-definer helpers get a pinned search_path.
-- 4. The meal-photos bucket gets size/MIME limits.
-- 5. reports / blocks tables for UGC safety (App Store Guideline 1.2).
-- 6. analyze_usage counter table for per-user analyzer quotas (service-role
--    only; written by the analyze Edge Function).

-- ---------- 1. profiles: owner-only rows + public projection ----------
drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles for select using (id = auth.uid());

create or replace view public_profiles as
  select id, username, display_name, avatar_emoji, avatar_color, bio, created_at
  from profiles;
grant select on public_profiles to anon, authenticated;

-- ---------- 2. profile_stats: respect RLS of the caller ----------
drop view if exists profile_stats;
create view profile_stats with (security_invoker = on) as
  select
    p.id,
    (select count(*) from follows f where f.following_id = p.id) as followers,
    (select count(*) from follows f where f.follower_id  = p.id) as following,
    (select count(*) from meals m where m.user_id = p.id)        as meal_count,
    (select round(avg(m.health_score_value)::numeric, 1)
       from meals m where m.user_id = p.id)                      as avg_score
  from public_profiles p;
grant select on profile_stats to anon, authenticated;

-- ---------- 3. pin search_path on definer functions ----------
alter function can_view_meal(uuid) set search_path = public;
alter function set_updated_at() set search_path = public;

-- ---------- 4. storage limits ----------
update storage.buckets
set file_size_limit = 10485760, -- 10 MB
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'meal-photos';

-- ---------- 5. trust & safety ----------
create table if not exists reports (
  id           uuid primary key default gen_random_uuid(),
  reporter_id  uuid not null references profiles (id) on delete cascade,
  subject_type text not null check (subject_type in ('meal', 'comment', 'user')),
  subject_id   text not null,
  reason       text not null default '' check (char_length(reason) <= 500),
  created_at   timestamptz not null default now()
);
alter table reports enable row level security;
drop policy if exists reports_insert on reports;
create policy reports_insert on reports for insert
  with check (reporter_id = auth.uid());
-- no select policy: reports are read by moderators via the dashboard only

create table if not exists blocks (
  blocker_id uuid not null references profiles (id) on delete cascade,
  blocked_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
alter table blocks enable row level security;
drop policy if exists blocks_select on blocks;
create policy blocks_select on blocks for select using (blocker_id = auth.uid());
drop policy if exists blocks_insert on blocks;
create policy blocks_insert on blocks for insert with check (blocker_id = auth.uid());
drop policy if exists blocks_delete on blocks;
create policy blocks_delete on blocks for delete using (blocker_id = auth.uid());

-- ---------- 6. analyzer quota counters (service-role only) ----------
create table if not exists analyze_usage (
  user_id uuid not null,
  day     date not null default current_date,
  count   integer not null default 0,
  primary key (user_id, day)
);
alter table analyze_usage enable row level security;
-- no policies: only the service role (Edge Function) reads/writes
