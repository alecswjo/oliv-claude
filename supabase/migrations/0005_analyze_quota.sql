-- Atomic per-user daily analyzer counter, called by the analyze Edge Function
-- with the service role. Clients cannot execute it (or touch analyze_usage).

create or replace function bump_analyze_usage(p_user_id uuid) returns integer
language sql
security definer
set search_path = public
as $$
  insert into analyze_usage (user_id, day, count)
  values (p_user_id, current_date, 1)
  on conflict (user_id, day) do update set count = analyze_usage.count + 1
  returning count;
$$;

revoke execute on function bump_analyze_usage(uuid) from public, anon, authenticated;
grant execute on function bump_analyze_usage(uuid) to service_role;
