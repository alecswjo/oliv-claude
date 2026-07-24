-- Oliv texting agent (docs/AGENT_V0_SPEC.md): channel identity linking, message
-- log, durable ingestion runs, and the RPCs the gateway edge functions use.
--
-- Trust model: the gateway (agent-inbound / agent-analyze) runs with the
-- service role. Clients can only mint their own link tokens and view/revoke
-- their own linked channels + message history. All other writes are
-- service-role only (no RLS policies granted).

-- ---------- channel identities (phone/sender ↔ Oliv user) ----------
create table if not exists channel_identities (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references profiles (id) on delete cascade,
  provider           text not null default 'sendblue',
  external_sender_id text not null,           -- E.164 for Sendblue; opaque for future providers
  status             text not null default 'active' check (status in ('active', 'revoked')),
  linked_at          timestamptz not null default now(),
  revoked_at         timestamptz,
  unique (provider, external_sender_id)
);
alter table channel_identities enable row level security;
drop policy if exists channel_identities_select on channel_identities;
create policy channel_identities_select on channel_identities
  for select using (user_id = auth.uid());
-- Users may revoke (status → 'revoked') their own link from the app.
drop policy if exists channel_identities_update on channel_identities;
create policy channel_identities_update on channel_identities
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- one-time linking tokens (minted via RPC, hashed at rest) ----------
create table if not exists channel_link_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles (id) on delete cascade,
  token_hash  text not null unique,
  timezone    text,                            -- device IANA tz captured at mint
  expires_at  timestamptz not null,
  consumed_at timestamptz,
  created_at  timestamptz not null default now()
);
alter table channel_link_tokens enable row level security;
-- no policies: all access via security-definer RPCs below

-- ---------- full inbound/outbound message log ----------
create table if not exists agent_messages (
  id                  uuid primary key default gen_random_uuid(),
  provider            text not null default 'sendblue',
  external_message_id text,
  external_sender_id  text not null,
  user_id             uuid references profiles (id) on delete cascade,
  direction           text not null check (direction in ('in', 'out')),
  content             text,
  media_count         integer not null default 0,
  run_id              uuid,
  meal_id             uuid references meals (id) on delete set null,
  client_ref          text,                    -- stable outbound ref (retry-safe sends)
  created_at          timestamptz not null default now(),
  unique (provider, external_message_id)
);
create index if not exists agent_messages_user_idx on agent_messages (user_id, created_at desc);
create index if not exists agent_messages_run_idx on agent_messages (run_id);
alter table agent_messages enable row level security;
drop policy if exists agent_messages_select on agent_messages;
create policy agent_messages_select on agent_messages
  for select using (user_id = auth.uid());

-- ---------- ingestion runs (capture window + exactly-once state machine) ----------
create table if not exists agent_runs (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references profiles (id) on delete cascade,
  provider           text not null default 'sendblue',
  external_sender_id text not null,
  kind               text not null default 'meal' check (kind in ('meal', 'chat')),
  state              text not null default 'collecting'
                     check (state in ('collecting', 'analyzing', 'committing', 'replied', 'failed')),
  ingestion_key      text unique,
  meal_id            uuid,
  closes_at          timestamptz not null,
  opened_at          timestamptz not null default now(),
  retry_count        integer not null default 0,
  last_error         text,
  media_urls         text[] not null default '{}',  -- transient vendor URLs for this capture window
  updated_at         timestamptz not null default now()
);
create index if not exists agent_runs_open_idx on agent_runs (external_sender_id) where state = 'collecting';
create index if not exists agent_runs_stuck_idx on agent_runs (updated_at) where state in ('analyzing', 'committing');
alter table agent_runs enable row level security;
-- no policies: service-role only

-- ---------- unknown-sender cooldowns (one canned reply / 24h) ----------
create table if not exists agent_cooldowns (
  sender_hash  text primary key,               -- sha256 of provider:sender (no raw strangers' numbers at rest)
  last_sent_at timestamptz not null default now(),
  attempts     integer not null default 0      -- bad LINK attempts counter
);
alter table agent_cooldowns enable row level security;
-- no policies: service-role only

-- ---------- per-user daily agent message quota ----------
create table if not exists agent_usage (
  user_id uuid not null,
  day     date not null default current_date,
  count   integer not null default 0,
  primary key (user_id, day)
);
alter table agent_usage enable row level security;
-- no policies: service-role only

create or replace function bump_agent_usage(p_user_id uuid) returns integer
language sql
security definer
set search_path = public
as $$
  insert into agent_usage (user_id, day, count)
  values (p_user_id, current_date, 1)
  on conflict (user_id, day) do update set count = agent_usage.count + 1
  returning count;
$$;
revoke execute on function bump_agent_usage(uuid) from public, anon, authenticated;
grant execute on function bump_agent_usage(uuid) to service_role;

-- Atomically append a message's media URLs to its capture run.
create or replace function append_run_media(p_run_id uuid, p_urls text[]) returns void
language sql
security definer
set search_path = public
as $$
  update agent_runs set media_urls = media_urls || p_urls, updated_at = now()
  where id = p_run_id;
$$;
revoke execute on function append_run_media(uuid, text[]) from public, anon, authenticated;
grant execute on function append_run_media(uuid, text[]) to service_role;

-- ---------- meals: ingestion provenance ----------
alter table meals add column if not exists ingestion_key text;
create unique index if not exists meals_ingestion_key_idx on meals (ingestion_key) where ingestion_key is not null;
alter table meals add column if not exists via text not null default 'app';

-- ---------- profiles: timezone + private-by-default for NEW users ----------
alter table profiles add column if not exists timezone text;
alter table profiles alter column default_private set default true;

-- ======================================================================
-- RPCs
-- ======================================================================

-- App-side: mint a one-time link token for the signed-in user. Returns the raw
-- token (only time it exists in cleartext); stores the sha256. One active
-- token per user — minting invalidates earlier unconsumed ones.
create or replace function mint_link_token(p_timezone text default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_token text;
  v_exp   timestamptz := now() + interval '15 minutes';
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  delete from channel_link_tokens where user_id = v_uid and consumed_at is null;
  v_token := encode(gen_random_bytes(16), 'hex');   -- 128-bit, URL/SMS-safe
  insert into channel_link_tokens (user_id, token_hash, timezone, expires_at)
  values (v_uid, encode(digest(v_token, 'sha256'), 'hex'), p_timezone, v_exp);
  return json_build_object('token', v_token, 'expiresAt', v_exp);
end;
$$;
grant execute on function mint_link_token(text) to authenticated;
revoke execute on function mint_link_token(text) from public, anon;

-- Gateway-side: atomically consume a token and link the sender.
--   status: linked | invalid | conflict
-- conflict = this sender is already actively linked to a DIFFERENT account
-- (never silently reassign). Relinking the same account reactivates.
create or replace function consume_link_token(p_token text, p_provider text, p_sender text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row      channel_link_tokens%rowtype;
  v_existing channel_identities%rowtype;
begin
  select * into v_row
  from channel_link_tokens
  where token_hash = encode(digest(p_token, 'sha256'), 'hex')
    and consumed_at is null
    and expires_at > now()
  for update;
  if not found then
    return json_build_object('status', 'invalid');
  end if;

  select * into v_existing
  from channel_identities
  where provider = p_provider and external_sender_id = p_sender;
  if found and v_existing.user_id <> v_row.user_id and v_existing.status = 'active' then
    return json_build_object('status', 'conflict');
  end if;

  update channel_link_tokens set consumed_at = now() where id = v_row.id;

  insert into channel_identities (user_id, provider, external_sender_id, status, linked_at, revoked_at)
  values (v_row.user_id, p_provider, p_sender, 'active', now(), null)
  on conflict (provider, external_sender_id)
  do update set user_id = excluded.user_id, status = 'active', linked_at = now(), revoked_at = null;

  update profiles set timezone = coalesce(timezone, v_row.timezone) where id = v_row.user_id;

  return json_build_object('status', 'linked', 'userId', v_row.user_id);
end;
$$;
revoke execute on function consume_link_token(text, text, text) from public, anon, authenticated;
grant execute on function consume_link_token(text, text, text) to service_role;

-- Gateway-side: exactly-once meal commit. Inserts the meal (keyed by
-- ingestion_key) and advances the run in one transaction. A retry that lost a
-- race finds the existing meal and reports 'exists'.
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

  update agent_runs
  set state = 'committing', meal_id = v_meal_id, updated_at = now()
  where id = p_run_id;

  return json_build_object('mealId', v_meal_id);
end;
$$;
revoke execute on function commit_agent_meal(uuid, jsonb) from public, anon, authenticated;
grant execute on function commit_agent_meal(uuid, jsonb) to service_role;
