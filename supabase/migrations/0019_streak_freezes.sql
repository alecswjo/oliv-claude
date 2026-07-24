-- Streak freezes ("Olive Saves") — one free streak repair per rolling week.
-- A freeze marks a missed day as covered; streak math unions freeze days with
-- meal days (src/domain/streaks.ts streakFromKeys/repairableDayKey).

create table if not exists streak_freezes (
  user_id    uuid not null references profiles (id) on delete cascade,
  day        date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);
alter table streak_freezes enable row level security;
drop policy if exists streak_freezes_select on streak_freezes;
create policy streak_freezes_select on streak_freezes
  for select using (user_id = auth.uid());
-- writes: only via the RPC below (rate limit enforced there)

-- One RPC for both surfaces: the app calls it authenticated (p_user_id must be
-- null → auth.uid()), the texting agent calls it with the service role and an
-- explicit user. Enforces one freeze per rolling 7 days.
--   status: used | already_covered | limit | invalid
create or replace function use_streak_freeze(p_day date, p_user_id uuid default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
begin
  if auth.role() = 'service_role' then
    v_uid := p_user_id;
  else
    if p_user_id is not null then return json_build_object('status', 'invalid'); end if;
    v_uid := auth.uid();
  end if;
  if v_uid is null then return json_build_object('status', 'invalid'); end if;
  -- Only recent misses are repairable — no rewriting ancient history.
  if p_day is null or p_day > current_date or p_day < current_date - 3 then
    return json_build_object('status', 'invalid');
  end if;
  if exists (select 1 from streak_freezes where user_id = v_uid and day = p_day) then
    return json_build_object('status', 'already_covered');
  end if;
  if exists (
    select 1 from streak_freezes
    where user_id = v_uid and created_at > now() - interval '7 days'
  ) then
    return json_build_object('status', 'limit');
  end if;
  insert into streak_freezes (user_id, day) values (v_uid, p_day);
  return json_build_object('status', 'used', 'day', p_day);
end;
$$;
grant execute on function use_streak_freeze(date, uuid) to authenticated, service_role;
revoke execute on function use_streak_freeze(date, uuid) from public, anon;
