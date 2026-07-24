-- Overnight hardening (review P0s/P1s):
--  1. Exactly-once guarantees at the database level: one collecting run per
--     sender (webhook-burst race) and one outbound send per client_ref.
--  2. commit_agent_meal reports when an insert was suppressed (tombstone)
--     instead of silently returning null.
--  3. meal-photos becomes PRIVATE: photos of private meals (health data) were
--     world-fetchable. Access now flows through signed URLs, gated by a
--     storage SELECT policy derived from can_view_meal().

-- ---------- 1. uniqueness the code was assuming ----------
-- Two racing webhook deliveries could both open a 'collecting' run.
create unique index if not exists agent_runs_one_open_idx
  on agent_runs (provider, external_sender_id) where state = 'collecting';

-- Outbound dedupe was check-then-insert; make the ref unique so insert-first
-- send-second is race-proof.
create unique index if not exists agent_messages_client_ref_idx
  on agent_messages (client_ref) where client_ref is not null;

-- ---------- 2. commit_agent_meal: surface tombstone suppression ----------
create or replace function commit_agent_meal(p_run_id uuid, p_meal jsonb)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meal_id uuid;
  v_key     text := p_meal->>'ingestion_key';
begin
  if p_run_id is not null and not exists (
    select 1 from agent_runs
    where id = p_run_id
      and user_id = (p_meal->>'user_id')::uuid
      and meal_id = (p_meal->>'id')::uuid
  ) then
    raise exception 'run does not own meal/user' using errcode = '42501';
  end if;

  select id into v_meal_id from meals where ingestion_key = v_key;
  if not found then
    insert into meals (
      id, user_id, photo_path, photo_paths, emoji, caption, description, meal_type,
      logged_at, calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg,
      saturated_fat_g, food_items, fruit_veg_servings, processing_level, confidence,
      health_score_value, health_score_factors, source, is_private, ingestion_key, via
    ) values (
      (p_meal->>'id')::uuid,
      (p_meal->>'user_id')::uuid,
      null,
      coalesce((select array_agg(x) from jsonb_array_elements_text(p_meal->'photo_paths') as t(x)), '{}'),
      nullif(p_meal->>'emoji', ''),
      nullif(p_meal->>'caption', ''),
      coalesce(p_meal->>'description', ''),
      (p_meal->>'meal_type')::meal_type,
      coalesce((p_meal->>'logged_at')::timestamptz, now()),
      (p_meal->>'calories')::integer,
      (p_meal->>'protein_g')::real,
      (p_meal->>'carbs_g')::real,
      (p_meal->>'fat_g')::real,
      (p_meal->>'fiber_g')::real,
      (p_meal->>'sugar_g')::real,
      (p_meal->>'sodium_mg')::integer,
      (p_meal->>'saturated_fat_g')::real,
      coalesce((select array_agg(x) from jsonb_array_elements_text(p_meal->'food_items') as t(x)), '{}'),
      (p_meal->>'fruit_veg_servings')::real,
      (p_meal->>'processing_level')::smallint,
      (p_meal->>'confidence')::confidence,
      (p_meal->>'health_score_value')::real,
      coalesce(p_meal->'health_score_factors', '[]'::jsonb),
      coalesce((p_meal->>'source')::meal_source, 'ai'),
      coalesce((p_meal->>'is_private')::boolean, true),
      v_key,
      coalesce(p_meal->>'via', 'imessage')
    )
    on conflict (id) do nothing;
    select id into v_meal_id from meals where ingestion_key = v_key;
  end if;

  if v_meal_id is null then
    -- Insert suppressed (tombstoned id) — report it, don't fake success.
    update agent_runs set state = 'failed', last_error = 'insert blocked (tombstone)',
      updated_at = now() where id = p_run_id;
    return json_build_object('status', 'blocked');
  end if;

  update agent_runs
  set state = 'committing', meal_id = v_meal_id, updated_at = now()
  where id = p_run_id;

  return json_build_object('status', 'committed', 'mealId', v_meal_id);
end;
$$;
revoke execute on function commit_agent_meal(uuid, jsonb) from public, anon, authenticated;
grant execute on function commit_agent_meal(uuid, jsonb) to service_role;

-- ---------- 3. private photo bucket + viewer-scoped signed URLs ----------
update storage.buckets set public = false where id = 'meal-photos';

-- Meal id embedded in the storage path: <userId>/<mealId>-<i>.jpg (or the
-- legacy <userId>/<mealId>.jpg). Null when the path doesn't match.
create or replace function meal_photo_meal_id(object_name text) returns uuid
language sql immutable as $$
  select (regexp_match(object_name,
    '/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:-[0-9]+)?\.jpg$'
  ))[1]::uuid;
$$;

-- A viewer may mint signed URLs only for photos of meals they can view
-- (owner always; others only when the meal is public) — same rule as meals RLS.
drop policy if exists meal_photos_select on storage.objects;
create policy meal_photos_select on storage.objects for select to authenticated
using (
  bucket_id = 'meal-photos'
  and meal_photo_meal_id(name) is not null
  and can_view_meal(meal_photo_meal_id(name))
);
