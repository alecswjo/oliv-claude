-- Push notifications: device tokens, per-user preferences, and a trigger→Edge
-- Function fan-out for social events (olive / comment / follow / new post).
--
-- The triggers call the `notify` Edge Function asynchronously via pg_net; the
-- function resolves recipients, checks their prefs, and sends Expo pushes with
-- the server-side key. The function URL + shared secret live in a private
-- settings table (seeded at deploy time, never in client reach).

create extension if not exists pg_net;

-- ---------- device push tokens (Expo push tokens) ----------
create table if not exists device_tokens (
  user_id    uuid not null references profiles (id) on delete cascade,
  token      text not null,
  platform   text not null default 'ios',
  updated_at timestamptz not null default now(),
  primary key (user_id, token)
);
alter table device_tokens enable row level security;
drop policy if exists device_tokens_select on device_tokens;
create policy device_tokens_select on device_tokens for select using (user_id = auth.uid());
drop policy if exists device_tokens_insert on device_tokens;
create policy device_tokens_insert on device_tokens for insert with check (user_id = auth.uid());
drop policy if exists device_tokens_update on device_tokens;
create policy device_tokens_update on device_tokens for update using (user_id = auth.uid());
drop policy if exists device_tokens_delete on device_tokens;
create policy device_tokens_delete on device_tokens for delete using (user_id = auth.uid());

-- ---------- per-user notification preferences ----------
create table if not exists notification_prefs (
  user_id    uuid primary key references profiles (id) on delete cascade,
  olives     boolean not null default true,
  comments   boolean not null default true,
  follows    boolean not null default true,
  new_posts  boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table notification_prefs enable row level security;
drop policy if exists notif_prefs_select on notification_prefs;
create policy notif_prefs_select on notification_prefs for select using (user_id = auth.uid());
drop policy if exists notif_prefs_insert on notification_prefs;
create policy notif_prefs_insert on notification_prefs for insert with check (user_id = auth.uid());
drop policy if exists notif_prefs_update on notification_prefs;
create policy notif_prefs_update on notification_prefs for update using (user_id = auth.uid());

-- ---------- private config (notify function URL + shared secret) ----------
create schema if not exists private;
revoke all on schema private from anon, authenticated;
create table if not exists private.app_settings (key text primary key, value text not null);
revoke all on private.app_settings from anon, authenticated;

-- ---------- trigger → Edge Function fan-out ----------
create or replace function private.notify_event() returns trigger
language plpgsql security definer set search_path = public, private, net as $$
declare
  fn_url text;
  secret text;
begin
  select value into fn_url from private.app_settings where key = 'notify_url';
  select value into secret from private.app_settings where key = 'notify_secret';
  if fn_url is null then return null; end if;  -- not configured yet → no-op

  perform net.http_post(
    url := fn_url,
    body := jsonb_build_object('type', TG_ARGV[0], 'record', to_jsonb(NEW)),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-notify-secret', coalesce(secret, '')
    ),
    timeout_milliseconds := 5000
  );
  return null;
end $$;

drop trigger if exists notify_olive on olives;
create trigger notify_olive after insert on olives
  for each row execute function private.notify_event('olive');

drop trigger if exists notify_comment on comments;
create trigger notify_comment after insert on comments
  for each row execute function private.notify_event('comment');

drop trigger if exists notify_follow on follows;
create trigger notify_follow after insert on follows
  for each row execute function private.notify_event('follow');

-- Only public meals fan out to followers; the function further skips backfill
-- (meals whose logged_at is older than an hour) so re-syncs don't spam.
drop trigger if exists notify_meal on meals;
create trigger notify_meal after insert on meals
  for each row when (new.is_private = false)
  execute function private.notify_event('meal');
