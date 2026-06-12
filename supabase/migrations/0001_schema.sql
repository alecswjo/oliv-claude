-- Oliv — initial production schema (Supabase / Postgres)
-- Implements the data model from docs/PRODUCT_SPEC.md §8 with Row-Level Security
-- enforcing the privacy rules from §F4.7 (private meals owner-only) and §F4.5
-- (comment moderation: author or meal owner may delete).

-- ---------- extensions ----------
create extension if not exists "pgcrypto";

-- ---------- enums ----------
do $$ begin
  create type meal_type as enum ('breakfast', 'lunch', 'dinner', 'snack');
exception when duplicate_object then null; end $$;

do $$ begin
  create type confidence as enum ('high', 'medium', 'low');
exception when duplicate_object then null; end $$;

do $$ begin
  create type meal_source as enum ('ai', 'ai-adjusted', 'manual');
exception when duplicate_object then null; end $$;

-- ---------- updated_at trigger ----------
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------- profiles ----------
-- One row per auth user. id mirrors auth.users.id.
create table if not exists profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  username        text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name    text not null check (char_length(display_name) between 1 and 30),
  avatar_emoji    text not null default '🫒',
  avatar_color    text not null default '#708238',
  bio             text not null default '' check (char_length(bio) <= 160),
  goals           jsonb not null,            -- { dailyCalories, proteinG, carbsG, fatG }
  goals_are_default boolean not null default true,
  body            jsonb,                     -- { sex, age, heightCm, weightKg, activity, goal } | null
  default_private boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

drop trigger if exists profiles_updated_at on profiles;
create trigger profiles_updated_at before update on profiles
  for each row execute function set_updated_at();

-- ---------- meals ----------
create table if not exists meals (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references profiles (id) on delete cascade,
  photo_path        text,                    -- storage path in `meal-photos`; null => emoji tile
  emoji             text,
  description       text not null default '',
  meal_type         meal_type not null,
  logged_at         timestamptz not null default now(),
  -- nutrition
  calories          integer not null check (calories between 0 and 5000),
  protein_g         real not null default 0,
  carbs_g           real not null default 0,
  fat_g             real not null default 0,
  fiber_g           real not null default 0,
  sugar_g           real not null default 0,
  sodium_mg         integer not null default 0,
  saturated_fat_g   real not null default 0,
  -- analysis
  food_items        text[] not null default '{}',
  fruit_veg_servings real not null default 0,
  processing_level  smallint not null check (processing_level between 1 and 4),
  confidence        confidence not null default 'low',
  health_score_value real not null check (health_score_value between 1 and 5),
  health_score_factors jsonb not null default '[]',
  source            meal_source not null default 'ai',
  is_private        boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

drop trigger if exists meals_updated_at on meals;
create trigger meals_updated_at before update on meals
  for each row execute function set_updated_at();

create index if not exists meals_user_logged_idx on meals (user_id, logged_at desc);
create index if not exists meals_feed_idx on meals (logged_at desc) where is_private = false;

-- ---------- follows (one-way, Instagram-style) ----------
create table if not exists follows (
  follower_id  uuid not null references profiles (id) on delete cascade,
  following_id uuid not null references profiles (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);
create index if not exists follows_following_idx on follows (following_id);

-- ---------- olives (likes) ----------
create table if not exists olives (
  meal_id    uuid not null references meals (id) on delete cascade,
  user_id    uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (meal_id, user_id)
);

-- ---------- comments ----------
create table if not exists comments (
  id         uuid primary key default gen_random_uuid(),
  meal_id    uuid not null references meals (id) on delete cascade,
  user_id    uuid not null references profiles (id) on delete cascade,
  text       text not null check (char_length(text) between 1 and 280),
  created_at timestamptz not null default now()
);
create index if not exists comments_meal_idx on comments (meal_id, created_at);

-- ======================================================================
-- Row-Level Security
-- ======================================================================
alter table profiles enable row level security;
alter table meals    enable row level security;
alter table follows  enable row level security;
alter table olives   enable row level security;
alter table comments enable row level security;

-- helper: can the current user see this meal?
create or replace function can_view_meal(m_id uuid) returns boolean
language sql security definer stable as $$
  select exists (
    select 1 from meals m
    where m.id = m_id
      and (m.is_private = false or m.user_id = auth.uid())
  );
$$;

-- profiles: world-readable; you manage only your own row
drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles for select using (true);
drop policy if exists profiles_upsert on profiles;
create policy profiles_upsert on profiles for insert with check (id = auth.uid());
drop policy if exists profiles_update on profiles;
create policy profiles_update on profiles for update using (id = auth.uid());

-- meals: public meals visible to all; private only to owner; writes own only
drop policy if exists meals_select on meals;
create policy meals_select on meals for select
  using (is_private = false or user_id = auth.uid());
drop policy if exists meals_insert on meals;
create policy meals_insert on meals for insert with check (user_id = auth.uid());
drop policy if exists meals_update on meals;
create policy meals_update on meals for update using (user_id = auth.uid());
drop policy if exists meals_delete on meals;
create policy meals_delete on meals for delete using (user_id = auth.uid());

-- follows: world-readable (counts); you manage only your own follow edges
drop policy if exists follows_select on follows;
create policy follows_select on follows for select using (true);
drop policy if exists follows_insert on follows;
create policy follows_insert on follows for insert with check (follower_id = auth.uid());
drop policy if exists follows_delete on follows;
create policy follows_delete on follows for delete using (follower_id = auth.uid());

-- olives: visible when the meal is; you add/remove only your own
drop policy if exists olives_select on olives;
create policy olives_select on olives for select using (can_view_meal(meal_id));
drop policy if exists olives_insert on olives;
create policy olives_insert on olives for insert with check (user_id = auth.uid() and can_view_meal(meal_id));
drop policy if exists olives_delete on olives;
create policy olives_delete on olives for delete using (user_id = auth.uid());

-- comments: visible when the meal is; author posts own; author OR meal owner deletes (moderation §F4.5)
drop policy if exists comments_select on comments;
create policy comments_select on comments for select using (can_view_meal(meal_id));
drop policy if exists comments_insert on comments;
create policy comments_insert on comments for insert
  with check (user_id = auth.uid() and can_view_meal(meal_id));
drop policy if exists comments_delete on comments;
create policy comments_delete on comments for delete using (
  user_id = auth.uid()
  or exists (select 1 from meals m where m.id = comments.meal_id and m.user_id = auth.uid())
);

-- ======================================================================
-- Profile stats (followers/following/meal counts, avg score)
-- ======================================================================
create or replace view profile_stats as
  select
    p.id,
    (select count(*) from follows f where f.following_id = p.id) as followers,
    (select count(*) from follows f where f.follower_id  = p.id) as following,
    (select count(*) from meals m where m.user_id = p.id)        as meal_count,
    (select round(avg(m.health_score_value)::numeric, 1)
       from meals m where m.user_id = p.id)                      as avg_score;
