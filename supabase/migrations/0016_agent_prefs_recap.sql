-- Texting-channel preferences + the daily-recap sweep.
--
-- agent_prefs.daily_recap is opt-in, set conversationally ("turn on my daily
-- recap"). An hourly pg_cron tick calls the agent-recap Edge Function, which
-- sends the recap to users whose local recap_hour has arrived. Sendblue note:
-- recaps to users inactive >24h count against the 200/day follow-up cap.

create table if not exists agent_prefs (
  user_id         uuid primary key references profiles (id) on delete cascade,
  daily_recap     boolean not null default false,
  recap_hour      integer not null default 20 check (recap_hour between 0 and 23),
  last_recap_date date,
  updated_at      timestamptz not null default now()
);
alter table agent_prefs enable row level security;
drop policy if exists agent_prefs_select on agent_prefs;
create policy agent_prefs_select on agent_prefs
  for select using (user_id = auth.uid());
-- writes: service role only (the agent's set_daily_recap tool)

-- Hourly tick → agent-recap Edge Function. Seed at deploy time:
--   insert into private.app_settings (key, value) values
--     ('agent_recap_url', 'https://<ref>.supabase.co/functions/v1/agent-recap'),
--     ('agent_webhook_secret', '<SENDBLUE_WEBHOOK_SECRET>')
--   on conflict (key) do update set value = excluded.value;
create or replace function private.agent_recap_tick() returns void
language plpgsql
security definer
set search_path = public, private, net as $$
declare
  fn_url text;
  secret text;
begin
  select value into fn_url from private.app_settings where key = 'agent_recap_url';
  if fn_url is null then return; end if;  -- not configured → no-op
  select value into secret from private.app_settings where key = 'agent_webhook_secret';
  perform net.http_post(
    url := fn_url,
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'sb-signing-secret', coalesce(secret, '')
    ),
    timeout_milliseconds := 10000
  );
end $$;

select cron.schedule('agent-recap', '5 * * * *', $$select private.agent_recap_tick()$$);
