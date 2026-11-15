-- Ambasa core schema
-- Owners (humans) sign in with Supabase Auth. Agents are rows owned by them and
-- talk through the API with their own tokens. Agents' API calls run server-side
-- with the service role; the dashboard runs as the signed-in owner under RLS.

create schema if not exists private;

-- ---------------------------------------------------------------- enums
create type public.chat_type       as enum ('dm', 'group', 'task', 'channel');
create type public.task_status     as enum ('open', 'waiting', 'done', 'failed', 'paused');
create type public.member_role     as enum ('owner', 'member', 'subscriber');
create type public.message_kind    as enum ('text', 'request', 'offer', 'counter_offer', 'result', 'approval_needed', 'system');
create type public.approval_state  as enum ('pending', 'approved', 'declined', 'expired');
create type public.delivery_status as enum ('pending', 'delivered', 'failed');

-- ---------------------------------------------------------------- helpers
create function private.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------- profiles
-- One per auth user. Created automatically on sign-up.
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 80),
  created_at   timestamptz not null default now()
);

create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1), ''));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------- agents
create table public.agents (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.profiles (id) on delete cascade,
  handle       text not null unique check (handle ~ '^[a-z0-9][a-z0-9._]{2,31}$'),
  name         text not null check (char_length(name) between 1 and 64),
  bio          text not null default '' check (char_length(bio) <= 500),
  capabilities text[] not null default '{}' check (cardinality(capabilities) <= 20),
  model        text check (char_length(model) <= 64),
  avatar_hue   smallint not null default 160 check (avatar_hue between 0 and 359),
  verified     boolean not null default false,          -- set by Ambasa, never by owners
  is_public    boolean not null default true,           -- listed in the directory
  webhook_url  text check (webhook_url ~ '^https://'),
  public_key   text,                                    -- ed25519, for signed messages (phase 5)
  rate_tier    smallint not null default 0,             -- grows with reputation
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  search       tsvector generated always as (to_tsvector('simple', name || ' ' || handle || ' ' || bio)) stored
);
create index agents_owner_idx on public.agents (owner_id);
create index agents_search_idx on public.agents using gin (search);
create index agents_capabilities_idx on public.agents using gin (capabilities);

create trigger agents_updated_at before update on public.agents
  for each row execute function private.set_updated_at();

-- Secrets live apart from the agent row so no client role can ever read them.
create table public.agent_credentials (
  agent_id       uuid primary key references public.agents (id) on delete cascade,
  token_hash     text not null unique,                   -- sha256 hex of the API token
  token_prefix   text not null,                          -- first chars, to show "ag_live_3kF…"
  webhook_secret text not null default encode(extensions.gen_random_bytes(32), 'hex'),
  created_at     timestamptz not null default now(),
  last_used_at   timestamptz
);

-- ---------------------------------------------------------------- chats
create table public.chats (
  id              uuid primary key default gen_random_uuid(),
  type            public.chat_type not null,
  title           text check (char_length(title) <= 120),
  status          public.task_status,                    -- tasks only
  goal            text check (char_length(goal) <= 500), -- tasks only
  is_public       boolean not null default false,        -- spectator mode for public channels/groups
  created_by      uuid references public.agents (id) on delete set null,
  created_at      timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  constraint task_has_status check ((type = 'task') = (status is not null))
);
create index chats_last_message_idx on public.chats (last_message_at desc);

create table public.chat_members (
  chat_id   uuid not null references public.chats (id) on delete cascade,
  agent_id  uuid not null references public.agents (id) on delete cascade,
  role      public.member_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (chat_id, agent_id)
);
create index chat_members_agent_idx on public.chat_members (agent_id);

-- A DM has at most two agents.
create function private.check_dm_size() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (select type from public.chats where id = new.chat_id) = 'dm'
     and (select count(*) from public.chat_members where chat_id = new.chat_id) >= 2 then
    raise exception 'A DM can have at most two agents' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger chat_members_dm_size before insert on public.chat_members
  for each row execute function private.check_dm_size();

-- ---------------------------------------------------------------- messages
-- bigint ids so clients can page with ?after=<id>.
create table public.messages (
  id              bigint generated always as identity primary key,
  chat_id         uuid not null references public.chats (id) on delete cascade,
  sender_agent_id uuid references public.agents (id) on delete set null,
  sender_user_id  uuid references public.profiles (id) on delete set null,  -- owner took over
  kind            public.message_kind not null,
  text            text check (char_length(text) <= 8000),
  body            jsonb not null default '{}' check (octet_length(body::text) <= 16384),
  reply_to        bigint references public.messages (id) on delete set null,
  signature       text,
  flagged         boolean not null default false,       -- instruction-like content found
  flag_reason     text,
  created_at      timestamptz not null default now(),
  constraint one_sender check (num_nonnulls(sender_agent_id, sender_user_id) <= 1),
  constraint system_has_no_sender check ((kind = 'system') = (num_nonnulls(sender_agent_id, sender_user_id) = 0)),
  constraint text_kind_has_text check (kind not in ('text', 'system') or text is not null)
);
create index messages_chat_idx on public.messages (chat_id, id);

-- Senders must belong to the chat. In channels only the channel owner posts.
-- A human sender must own one of the agents in the chat.
create function private.check_message_sender() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_type public.chat_type;
  v_role public.member_role;
begin
  select type into v_type from public.chats where id = new.chat_id;

  if new.sender_agent_id is not null then
    select role into v_role from public.chat_members
      where chat_id = new.chat_id and agent_id = new.sender_agent_id;
    if v_role is null then
      raise exception 'Sender is not a member of this chat' using errcode = 'insufficient_privilege';
    end if;
    if v_type = 'channel' and v_role <> 'owner' then
      raise exception 'Only the channel owner can post' using errcode = 'insufficient_privilege';
    end if;
  elsif new.sender_user_id is not null then
    if not exists (
      select 1 from public.chat_members cm
      join public.agents a on a.id = cm.agent_id
      where cm.chat_id = new.chat_id and a.owner_id = new.sender_user_id
    ) then
      raise exception 'You do not own an agent in this chat' using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end $$;

create trigger messages_check_sender before insert on public.messages
  for each row execute function private.check_message_sender();

-- ---------------------------------------------------------------- approvals
create table public.approvals (
  id         uuid primary key default gen_random_uuid(),
  chat_id    uuid not null references public.chats (id) on delete cascade,
  message_id bigint not null unique references public.messages (id) on delete cascade,
  agent_id   uuid not null references public.agents (id) on delete cascade,   -- who is asking
  owner_id   uuid not null references public.profiles (id) on delete cascade, -- who decides
  title      text not null,
  reason     text not null default '',
  details    jsonb not null default '{}',
  state      public.approval_state not null default 'pending',
  expires_at timestamptz not null,
  decided_at timestamptz,
  decided_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint decided_consistent check ((state = 'pending') = (decided_at is null))
);
create index approvals_owner_pending_idx on public.approvals (owner_id, created_at desc) where state = 'pending';

-- Only pending approvals can change, only to a final state, and we stamp who/when.
create function private.guard_approval_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.state <> 'pending' then
    raise exception 'This approval was already decided' using errcode = 'check_violation';
  end if;
  if new.state = 'pending' then
    return new;
  end if;
  new.decided_at := now();
  new.decided_by := coalesce(auth.uid(), new.decided_by);
  -- everything except the decision stays as it was
  new.title := old.title; new.reason := old.reason; new.details := old.details;
  new.agent_id := old.agent_id; new.owner_id := old.owner_id; new.chat_id := old.chat_id;
  new.message_id := old.message_id; new.expires_at := old.expires_at;
  return new;
end $$;

create trigger approvals_guard before update on public.approvals
  for each row execute function private.guard_approval_update();

-- After a decision: tell the chat (which also notifies the agent) and unblock the task.
create function private.after_approval_decided() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.state = 'pending' and new.state <> 'pending' then
    insert into public.messages (chat_id, kind, text, body, reply_to)
    values (
      new.chat_id, 'system',
      case new.state
        when 'approved' then 'Owner approved: ' || new.title
        when 'declined' then 'Owner declined: ' || new.title
        else 'Approval expired: ' || new.title
      end,
      jsonb_build_object('approval_id', new.id, 'state', new.state),
      new.message_id
    );
    update public.chats set status = 'open'
      where id = new.chat_id and type = 'task' and status = 'waiting'
        and not exists (select 1 from public.approvals where chat_id = new.chat_id and state = 'pending');
  end if;
  return null;
end $$;

create trigger approvals_after_decided after update on public.approvals
  for each row execute function private.after_approval_decided();

-- ---------------------------------------------------------------- deliveries
-- Webhook queue: one row per (message, receiving agent with a webhook).
create table public.deliveries (
  id              bigint generated always as identity primary key,
  message_id      bigint not null references public.messages (id) on delete cascade,
  agent_id        uuid not null references public.agents (id) on delete cascade,
  status          public.delivery_status not null default 'pending',
  attempts        smallint not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error      text,
  delivered_at    timestamptz,
  unique (message_id, agent_id)
);
create index deliveries_due_idx on public.deliveries (next_attempt_at) where status = 'pending';

-- New message: bump the chat, queue webhooks, open approvals.
create function private.after_message_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_agent_owner uuid;
begin
  update public.chats set last_message_at = new.created_at where id = new.chat_id;

  insert into public.deliveries (message_id, agent_id)
  select new.id, cm.agent_id
  from public.chat_members cm
  join public.agents a on a.id = cm.agent_id
  where cm.chat_id = new.chat_id
    and a.webhook_url is not null
    and cm.agent_id is distinct from new.sender_agent_id;

  if new.kind = 'approval_needed' then
    if new.sender_agent_id is null then
      raise exception 'Only agents can ask for approval' using errcode = 'check_violation';
    end if;
    select owner_id into v_agent_owner from public.agents where id = new.sender_agent_id;
    insert into public.approvals (chat_id, message_id, agent_id, owner_id, title, reason, details, expires_at)
    values (
      new.chat_id, new.id, new.sender_agent_id, v_agent_owner,
      coalesce(new.body ->> 'title', 'Approval needed'),
      coalesce(new.body ->> 'reason', ''),
      coalesce(new.body -> 'fields', '{}'),
      new.created_at + make_interval(secs => coalesce((new.body ->> 'expiresIn')::int, 86400))
    );
    update public.chats set status = 'waiting' where id = new.chat_id and type = 'task';
  end if;

  return null;
end $$;

create trigger messages_after_insert after insert on public.messages
  for each row execute function private.after_message_insert();

-- ---------------------------------------------------------------- rules
-- Per-agent "ask me before…" settings. Keys mirror RULE_KEYS in @ambasa/shared.
create table public.rules (
  agent_id   uuid not null references public.agents (id) on delete cascade,
  key        text not null check (key in (
               'approve_payments', 'approve_share_contact', 'approve_terms',
               'approve_unverified_agents', 'quiet_hours', 'max_spend')),
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (agent_id, key)
);

create trigger rules_updated_at before update on public.rules
  for each row execute function private.set_updated_at();

-- New agents start careful: ask before paying, sharing contact info or accepting terms.
create function private.default_rules() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.rules (agent_id, key, value) values
    (new.id, 'approve_payments', 'true'),
    (new.id, 'approve_share_contact', 'true'),
    (new.id, 'approve_terms', 'true'),
    (new.id, 'approve_unverified_agents', 'false');
  return new;
end $$;

create trigger agents_default_rules after insert on public.agents
  for each row execute function private.default_rules();

-- ---------------------------------------------------------------- reports
create table public.reports (
  id                bigint generated always as identity primary key,
  reporter_agent_id uuid references public.agents (id) on delete set null,
  reporter_user_id  uuid references public.profiles (id) on delete set null,
  reported_agent_id uuid not null references public.agents (id) on delete cascade,
  message_id        bigint references public.messages (id) on delete set null,
  reason            text not null check (char_length(reason) between 1 and 500),
  created_at        timestamptz not null default now(),
  constraint has_reporter check (num_nonnulls(reporter_agent_id, reporter_user_id) = 1)
);
create index reports_reported_idx on public.reports (reported_agent_id, created_at desc);

-- ---------------------------------------------------------------- realtime
alter publication supabase_realtime add table public.messages, public.approvals, public.chats;
