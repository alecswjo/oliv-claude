-- Coupon codes: comped Pro access for friends/testers, layered on the
-- subscriptions mirror (0018). Redeeming writes a comp entitlement row that
-- expires like any other; all gating keeps reading one table.
--
-- Mint codes from the admin surface / SQL editor, e.g.:
--   insert into coupon_codes (code, kind, duration_days, max_redemptions)
--   values ('FRIENDS2026', 'comp', 90, 20);

create table if not exists coupon_codes (
  code            text primary key check (code ~ '^[A-Z0-9_-]{4,24}$'),
  kind            text not null default 'comp' check (kind in ('comp')),
  duration_days   integer not null default 30 check (duration_days between 1 and 730),
  max_redemptions integer not null default 1 check (max_redemptions between 1 and 10000),
  redeemed_count  integer not null default 0,
  expires_at      timestamptz,                 -- null = code never expires
  created_at      timestamptz not null default now()
);
alter table coupon_codes enable row level security;
-- no client policies: codes are validated inside the RPC only (no enumeration)

create table if not exists coupon_redemptions (
  code       text not null references coupon_codes (code) on delete cascade,
  user_id    uuid not null references profiles (id) on delete cascade,
  granted_until timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (code, user_id)
);
alter table coupon_redemptions enable row level security;
drop policy if exists coupon_redemptions_select on coupon_redemptions;
create policy coupon_redemptions_select on coupon_redemptions
  for select using (user_id = auth.uid());

--   status: redeemed | invalid | exhausted | expired | already_redeemed
create or replace function redeem_coupon(p_code text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_code  coupon_codes%rowtype;
  v_until timestamptz;
begin
  if v_uid is null then return json_build_object('status', 'invalid'); end if;

  select * into v_code from coupon_codes
  where code = upper(trim(p_code)) for update;
  if not found then return json_build_object('status', 'invalid'); end if;
  if v_code.expires_at is not null and v_code.expires_at < now() then
    return json_build_object('status', 'expired');
  end if;
  if v_code.redeemed_count >= v_code.max_redemptions then
    return json_build_object('status', 'exhausted');
  end if;
  if exists (select 1 from coupon_redemptions where code = v_code.code and user_id = v_uid) then
    return json_build_object('status', 'already_redeemed');
  end if;

  v_until := now() + make_interval(days => v_code.duration_days);
  insert into coupon_redemptions (code, user_id, granted_until)
  values (v_code.code, v_uid, v_until);
  update coupon_codes set redeemed_count = redeemed_count + 1 where code = v_code.code;

  -- Comp entitlement rides the same subscriptions mirror the paywall reads.
  insert into subscriptions (
    user_id, entitlement_id, product_id, store, environment, period_type,
    status, expires_at, last_event_type, last_event_at
  ) values (
    v_uid, 'pro', 'coupon:' || v_code.code, 'promotional', 'production', 'promo',
    'active', v_until, 'COUPON_REDEEMED', now()
  )
  on conflict (user_id, entitlement_id) do update set
    -- Never downgrade a longer-lived entitlement with a shorter comp.
    expires_at = case
      -- Null expiry on an active store entitlement means non-expiring access.
      when subscriptions.status = 'active' and subscriptions.expires_at is null then null
      else greatest(coalesce(subscriptions.expires_at, 'epoch'::timestamptz), excluded.expires_at)
    end,
    status = 'active',
    last_event_type = 'COUPON_REDEEMED',
    last_event_at = now(),
    updated_at = now();

  return json_build_object('status', 'redeemed', 'until', v_until);
end;
$$;
grant execute on function redeem_coupon(text) to authenticated;
revoke execute on function redeem_coupon(text) from public, anon;
