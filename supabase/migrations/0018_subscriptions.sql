-- Store subscription mirror. RevenueCat remains the purchase source of truth;
-- this table gives server-side texting features a fast, auditable entitlement
-- check. Clients may read only their own row and may never write it.

create table if not exists subscriptions (
  user_id          uuid not null references profiles (id) on delete cascade,
  entitlement_id   text not null,
  product_id       text,
  store            text,
  environment      text,
  period_type      text,
  status           text not null check (status in ('active', 'cancelled', 'billing_issue', 'expired')),
  expires_at       timestamptz,
  last_event_type  text not null,
  last_event_at    timestamptz not null,
  updated_at       timestamptz not null default now(),
  primary key (user_id, entitlement_id)
);
alter table subscriptions enable row level security;
drop policy if exists subscriptions_select_own on subscriptions;
create policy subscriptions_select_own on subscriptions
  for select using (user_id = auth.uid());

create table if not exists revenuecat_events (
  event_id      text primary key,
  user_id       uuid references profiles (id) on delete set null,
  event_type    text not null,
  received_at   timestamptz not null default now()
);
alter table revenuecat_events enable row level security;
-- no policies: service-role audit/dedup only

create or replace function apply_revenuecat_subscription_event(
  p_event_id text,
  p_user_id uuid,
  p_entitlement_id text,
  p_product_id text,
  p_store text,
  p_environment text,
  p_period_type text,
  p_status text,
  p_expires_at timestamptz,
  p_event_type text,
  p_event_at timestamptz
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into revenuecat_events (event_id, user_id, event_type)
  values (p_event_id, p_user_id, p_event_type)
  on conflict (event_id) do nothing;
  if not found then return false; end if;

  insert into subscriptions (
    user_id, entitlement_id, product_id, store, environment, period_type,
    status, expires_at, last_event_type, last_event_at
  ) values (
    p_user_id, p_entitlement_id, p_product_id, p_store, p_environment,
    p_period_type, p_status, p_expires_at, p_event_type, p_event_at
  )
  on conflict (user_id, entitlement_id) do update set
    product_id = excluded.product_id,
    store = excluded.store,
    environment = excluded.environment,
    period_type = excluded.period_type,
    status = excluded.status,
    expires_at = excluded.expires_at,
    last_event_type = excluded.last_event_type,
    last_event_at = excluded.last_event_at,
    updated_at = now()
  -- Webhooks can arrive out of order. A stale cancellation/renewal may never
  -- roll back a newer entitlement decision.
  where subscriptions.last_event_at <= excluded.last_event_at;
  return true;
end;
$$;
revoke execute on function apply_revenuecat_subscription_event(
  text, uuid, text, text, text, text, text, text, timestamptz, text, timestamptz
) from public, anon, authenticated;
grant execute on function apply_revenuecat_subscription_event(
  text, uuid, text, text, text, text, text, text, timestamptz, text, timestamptz
) to service_role;

-- Add entitlement visibility to the owner dashboard.
create or replace function admin_dashboard_summary() returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_app_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'users', (select count(*) from profiles),
    'mealsToday', (select count(*) from meals where logged_at >= current_date),
    'messages24h', (select count(*) from agent_messages where created_at >= now() - interval '24 hours'),
    'failedRuns24h', (
      select count(*) from agent_runs
      where state = 'failed' and updated_at >= now() - interval '24 hours'
    ),
    'activeTextLinks', (select count(*) from channel_identities where status = 'active'),
    'activePro', (
      select count(*) from subscriptions
      where status <> 'expired' and (expires_at is null or expires_at > now())
    ),
    'analysesToday', (select coalesce(sum(count), 0) from analyze_usage where day = current_date)
  );
end;
$$;
revoke execute on function admin_dashboard_summary() from public, anon;
grant execute on function admin_dashboard_summary() to authenticated;

