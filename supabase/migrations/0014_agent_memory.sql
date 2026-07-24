-- Durable, user-visible memory for the texting agent.
--
-- Only explicit preferences are stored. The gateway writes with the service
-- role; users can inspect and delete their own memories. Account deletion
-- cascades these rows through profiles(id).

create table if not exists agent_memories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles (id) on delete cascade,
  key        text not null check (char_length(key) between 2 and 60),
  value      text not null check (char_length(value) between 2 and 300),
  source     text not null default 'user_explicit'
             check (source in ('user_explicit', 'profile')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, key)
);

create index if not exists agent_memories_user_updated_idx
  on agent_memories (user_id, updated_at desc);

alter table agent_memories enable row level security;

drop policy if exists agent_memories_select_own on agent_memories;
create policy agent_memories_select_own on agent_memories
  for select using (user_id = auth.uid());

drop policy if exists agent_memories_delete_own on agent_memories;
create policy agent_memories_delete_own on agent_memories
  for delete using (user_id = auth.uid());

revoke insert, update on agent_memories from anon, authenticated;
