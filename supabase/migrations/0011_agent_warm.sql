-- Keep the agent-inbound edge function warm: a cold start adds seconds to the
-- typing-indicator ack, which defeats the "instant" feel of the texting agent.
-- A pg_cron ping every minute keeps an instance hot. The URL (which embeds the
-- shared secret) lives in private.app_settings, seeded at deploy time:
--   insert into private.app_settings (key, value)
--   values ('agent_warm_url', 'https://<ref>.supabase.co/functions/v1/agent-inbound?secret=<AGENT_SECRET>')
--   on conflict (key) do update set value = excluded.value;

create extension if not exists pg_cron;

create or replace function private.agent_warm() returns void
language plpgsql
security definer
set search_path = public, private, net
as $$
declare
  warm_url text;
begin
  select value into warm_url from private.app_settings where key = 'agent_warm_url';
  if warm_url is null then return; end if;  -- not configured → no-op
  perform net.http_post(
    url := warm_url,
    body := '{}'::jsonb,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 5000
  );
end $$;

select cron.schedule('agent-warm', '* * * * *', $$select private.agent_warm()$$);
