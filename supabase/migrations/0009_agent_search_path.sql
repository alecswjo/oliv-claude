-- Fix 0008: on hosted Supabase, pgcrypto lives in the `extensions` schema, so
-- the token RPCs' pinned `search_path = public` made digest()/gen_random_bytes()
-- unresolvable at runtime. Re-pin to `public, extensions`.

create or replace function mint_link_token(p_timezone text default null)
returns json
language plpgsql
security definer
set search_path = public, extensions
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

create or replace function consume_link_token(p_token text, p_provider text, p_sender text)
returns json
language plpgsql
security definer
set search_path = public, extensions
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
