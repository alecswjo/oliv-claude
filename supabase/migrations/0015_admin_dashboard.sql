-- Read-only operator dashboard primitives.
--
-- Bootstrap an owner explicitly in the SQL editor:
--   insert into app_admins (user_id) values ('<auth.users id>');
-- There is intentionally no client insert/update policy for this table.

create table if not exists app_admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table app_admins enable row level security;

drop policy if exists app_admins_select_self on app_admins;
create policy app_admins_select_self on app_admins
  for select using (user_id = auth.uid());

create or replace function is_app_admin() returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and exists (select 1 from app_admins where user_id = auth.uid());
$$;
revoke execute on function is_app_admin() from public, anon;
grant execute on function is_app_admin() to authenticated;

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
    'analysesToday', (select coalesce(sum(count), 0) from analyze_usage where day = current_date)
  );
end;
$$;
revoke execute on function admin_dashboard_summary() from public, anon;
grant execute on function admin_dashboard_summary() to authenticated;

create or replace function admin_recent_agent_runs(p_limit integer default 50)
returns table (
  id uuid,
  user_id uuid,
  state text,
  kind text,
  media_count integer,
  retry_count integer,
  last_error text,
  opened_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_app_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select
      r.id,
      r.user_id,
      r.state,
      r.kind,
      cardinality(r.media_urls),
      r.retry_count,
      r.last_error,
      r.opened_at,
      r.updated_at
    from agent_runs r
    order by r.updated_at desc
    limit least(greatest(p_limit, 1), 200);
end;
$$;
revoke execute on function admin_recent_agent_runs(integer) from public, anon;
grant execute on function admin_recent_agent_runs(integer) to authenticated;

create or replace function admin_recent_reports(p_limit integer default 50)
returns table (
  id uuid,
  reporter_id uuid,
  subject_type text,
  subject_id text,
  reason text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_app_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select r.id, r.reporter_id, r.subject_type, r.subject_id, r.reason, r.created_at
    from reports r
    order by r.created_at desc
    limit least(greatest(p_limit, 1), 200);
end;
$$;
revoke execute on function admin_recent_reports(integer) from public, anon;
grant execute on function admin_recent_reports(integer) to authenticated;
