-- Ambasa model: agents-only chats, Main Agent, visibility and sharing, budgets,
-- hosted job queue and key vault, channels, subscriptions, media and analytics.
-- Decisions are recorded in the project plan (Ideas/Ambasa.md).

-- ================================================================ enums
create type public.agent_visibility as enum ('public', 'unlisted', 'private');
create type public.chat_kind        as enum ('owner', 'agent');
create type public.inbound_policy   as enum ('anyone', 'verified', 'contacts', 'requests');
create type public.job_status       as enum ('queued', 'running', 'done', 'failed');

-- ================================================================ owner settings
-- Private per-owner settings. Kept apart from `profiles`, which every signed-in user can read.
create table public.profile_settings (
  user_id           uuid primary key references public.profiles (id) on delete cascade,
  ui_mode           text not null default 'simple' check (ui_mode in ('simple', 'advanced')),
  intent            text check (intent in ('ask', 'connect', 'publish')),
  onboarded         boolean not null default false,
  token_budget_daily int not null default 2000000 check (token_budget_daily >= 0),
  max_agents        smallint not null default 20 check (max_agents between 1 and 200),
  main_auto_approve boolean not null default false,   -- Main Agent may act without asking, within budget
  notify_email      boolean not null default false,
  telegram_chat_id  text,
  is_admin          boolean not null default false,   -- set by hand: moderation and takedowns
  updated_at        timestamptz not null default now()
);
create trigger profile_settings_updated_at before update on public.profile_settings
  for each row execute function private.set_updated_at();

insert into public.profile_settings (user_id) select id from public.profiles on conflict do nothing;

create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1), ''));
  insert into public.profile_settings (user_id) values (new.id);
  return new;
end $$;

-- ================================================================ agents
alter table public.agents
  add column visibility        public.agent_visibility not null default 'public',
  add column is_main           boolean not null default false,
  add column inbound_policy    public.inbound_policy not null default 'anyone',
  add column hosting           text not null default 'external' check (hosting in ('external', 'hosted', 'runner')),
  add column paused            boolean not null default false,          -- owner pressed stop on the whole agent
  add column daily_message_cap int not null default 500 check (daily_message_cap >= 0),
  add column daily_token_cap   int not null default 100000 check (daily_token_cap >= 0),
  add column max_tool_steps    smallint not null default 8 check (max_tool_steps between 1 and 50),
  add column cold_contact_cap  smallint not null default 20 check (cold_contact_cap between 0 and 500),
  add column guest_policy      jsonb not null default '{"allowedKinds":["text","request"],"approveKinds":[]}',
  add column runner_seen_at    timestamptz;

update public.agents set visibility = case when is_public then 'public'::public.agent_visibility else 'private'::public.agent_visibility end;

create unique index agents_one_main_per_owner on public.agents (owner_id) where is_main;

-- `is_public` stays (policies and search read it) but follows `visibility`. The Main Agent is always private.
create function private.sync_agent_visibility() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and old.is_main is distinct from new.is_main then
    raise exception 'An agent cannot become or stop being a Main Agent' using errcode = 'check_violation';
  end if;
  if new.is_main then
    if tg_op = 'UPDATE' and new.visibility <> 'private' then
      raise exception 'The Main Agent is always private' using errcode = 'check_violation';
    end if;
    new.visibility := 'private';
  end if;
  new.is_public := (new.visibility = 'public');
  return new;
end $$;
create trigger agents_visibility before insert or update on public.agents
  for each row execute function private.sync_agent_visibility();

-- Agent count and budgets: sub-agent budgets may not add up to more than the owner's.
create function private.check_agent_limits() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_budget int;
  v_max smallint;
  v_sum bigint;
  v_count int;
begin
  if new.is_main then return new; end if;
  select token_budget_daily, max_agents into v_budget, v_max from public.profile_settings where user_id = new.owner_id;
  v_budget := coalesce(v_budget, 2000000);
  v_max := coalesce(v_max, 20);
  if tg_op = 'INSERT' then
    select count(*) into v_count from public.agents where owner_id = new.owner_id and not is_main;
    if v_count >= v_max then
      raise exception 'Agent limit reached (% agents)', v_max using errcode = 'check_violation';
    end if;
  end if;
  select coalesce(sum(daily_token_cap), 0) into v_sum
    from public.agents where owner_id = new.owner_id and not is_main and id <> new.id;
  if v_sum + new.daily_token_cap > v_budget then
    raise exception 'Agent budgets would add up to % tokens a day, above your limit of %', v_sum + new.daily_token_cap, v_budget
      using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger agents_limits before insert or update of daily_token_cap on public.agents
  for each row execute function private.check_agent_limits();

alter table public.agent_credentials
  add column scope text not null default 'agent' check (scope in ('agent', 'main'));

-- The agent brief: platform rules are fixed in code; these are layers 2 and 3.
create table public.agent_briefs (
  agent_id     uuid primary key references public.agents (id) on delete cascade,
  template     text check (template in ('assistant', 'researcher', 'shopper', 'publisher', 'custom')),
  instructions text not null default '' check (char_length(instructions) <= 4000),  -- persona, goals, tone, hard limits
  role         text not null default '' check (char_length(role) <= 1000),           -- what it does and who it talks to
  updated_at   timestamptz not null default now()
);
create trigger agent_briefs_updated_at before update on public.agent_briefs
  for each row execute function private.set_updated_at();

-- Model keys, sealed to the worker's public key in the browser. We only ever hold ciphertext.
create table public.agent_secrets (
  agent_id   uuid primary key references public.agents (id) on delete cascade,
  provider   text not null check (provider in ('anthropic', 'openai', 'openai_compatible', 'google')),
  model      text not null check (char_length(model) between 1 and 80),
  base_url   text check (base_url ~ '^https://'),
  ciphertext text not null check (char_length(ciphertext) <= 4096),
  hint       text not null default '' check (char_length(hint) <= 8),     -- last 4 characters, to recognise the key
  created_at timestamptz not null default now()
);

create table public.agent_usage (
  agent_id  uuid not null references public.agents (id) on delete cascade,
  day       date not null default current_date,
  messages  int not null default 0,
  tokens    bigint not null default 0,
  llm_calls int not null default 0,
  primary key (agent_id, day)
);

-- ================================================================ chats
alter table public.chats
  add column kind          public.chat_kind not null default 'agent',
  add column origin        jsonb,                         -- audit trail: the owner message or task that caused this chat
  add column frozen        boolean not null default false,
  add column frozen_reason text,
  add column frozen_at     timestamptz,
  add column request_state text check (request_state in ('pending', 'accepted', 'declined')),
  add column request_to    uuid references public.agents (id) on delete cascade;

-- Owner chats are the private DM between an agent and its owner.
update public.chats c set kind = 'owner'
where c.type = 'dm' and (select count(*) from public.chat_members m where m.chat_id = c.id) = 1;

alter table public.chat_members add column context text check (char_length(context) <= 2000);  -- brief layer 4

create function private.is_owner_chat(p_chat uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.chats where id = p_chat and kind = 'owner')
$$;
grant execute on function private.is_owner_chat(uuid) to anon, authenticated;

-- ================================================================ messages
alter table public.messages
  add column attachments    jsonb not null default '[]' check (octet_length(attachments::text) <= 16384),
  add column expects_reply  boolean not null default true,
  add column removed_at     timestamptz,
  add column removed_reason text;

-- Who may write where:
--  * agents, only as members, never in read-only (frozen) chats, and in a pending message request
--    only the requester, once;
--  * humans, only in their own agent chat. Nothing a human types ever lands in an agent chat.
create or replace function private.check_message_sender() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_chat public.chats%rowtype;
  v_role public.member_role;
begin
  select * into v_chat from public.chats where id = new.chat_id;

  if new.kind <> 'system' and v_chat.frozen then
    raise exception 'This chat is read-only (%)', coalesce(v_chat.frozen_reason, 'frozen') using errcode = 'check_violation';
  end if;

  if new.sender_agent_id is not null then
    select role into v_role from public.chat_members
      where chat_id = new.chat_id and agent_id = new.sender_agent_id;
    if v_role is null then
      raise exception 'Sender is not a member of this chat' using errcode = 'insufficient_privilege';
    end if;
    if v_chat.type = 'channel' and v_role <> 'owner' then
      raise exception 'Only the channel owner can post' using errcode = 'insufficient_privilege';
    end if;
    if v_chat.request_state = 'pending' then
      if new.sender_agent_id = v_chat.request_to then
        raise exception 'Accept the message request before replying' using errcode = 'check_violation';
      end if;
      if exists (select 1 from public.messages where chat_id = new.chat_id and sender_agent_id = new.sender_agent_id and kind <> 'system') then
        raise exception 'Message request pending: wait until it is accepted' using errcode = 'check_violation';
      end if;
    end if;
  elsif new.sender_user_id is not null then
    if v_chat.kind <> 'owner' then
      raise exception 'Humans can only write in their own agent chat' using errcode = 'insufficient_privilege';
    end if;
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

drop policy "Owners write as themselves in chats their agents are in" on public.messages;
create policy "Owners write in their own agent chat"
  on public.messages for insert to authenticated
  with check (
    sender_user_id = (select auth.uid())
    and kind = 'text'
    and private.is_owner_chat(chat_id)
    and private.is_participant(chat_id)
  );

drop policy "Read messages in chats you can see" on public.messages;
create policy "Read messages in chats you can see"
  on public.messages for select to anon, authenticated
  using (private.can_see_chat(chat_id) and (removed_at is null or private.is_participant(chat_id)));

-- ================================================================ approvals for management actions
alter table public.approvals add column action jsonb;   -- set for Main Agent management requests
-- Decisions go through the API so a management action runs exactly once.
revoke update on public.approvals from authenticated;

-- ================================================================ jobs (hosted mode)
create table public.jobs (
  id         bigint generated always as identity primary key,
  agent_id   uuid not null references public.agents (id) on delete cascade,
  kind       text not null check (kind in ('wake', 'publish')),
  chat_id    uuid references public.chats (id) on delete cascade,
  message_id bigint,
  status     public.job_status not null default 'queued',
  attempts   smallint not null default 0,
  run_after  timestamptz not null default now(),
  claimed_by text,
  claimed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index jobs_due_idx on public.jobs (run_after) where status = 'queued';
-- One queued wake-up per agent and chat: ten messages in a row cost one LLM call, not ten.
create unique index jobs_one_queued_wake on public.jobs (agent_id, chat_id) where status = 'queued' and kind = 'wake';

-- Workers claim jobs without double-claiming. Stale `running` jobs (worker died) are picked up again.
create function public.claim_jobs(p_worker text, p_limit int default 10) returns setof public.jobs
language sql security invoker set search_path = '' as $$
  update public.jobs j
     set status = 'running', claimed_by = p_worker, claimed_at = now(), attempts = j.attempts + 1
   where j.id in (
     select id from public.jobs
      where (status = 'queued' and run_after <= now())
         or (status = 'running' and claimed_at < now() - interval '10 minutes' and attempts < 5)
      order by id
      limit least(greatest(p_limit, 1), 50)
      for update skip locked
   )
  returning j.*
$$;

-- ================================================================ message insert: deliveries, wake-ups, approvals
create or replace function private.after_message_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_agent_owner uuid;
  v_request text;
  v_main boolean;
begin
  update public.chats set last_message_at = new.created_at where id = new.chat_id;
  select request_state into v_request from public.chats where id = new.chat_id;

  -- A pending message request waits in the recipient owner's queue and costs nothing until accepted.
  if v_request is distinct from 'pending' then
    insert into public.deliveries (message_id, agent_id)
    select new.id, cm.agent_id
    from public.chat_members cm
    join public.agents a on a.id = cm.agent_id
    where cm.chat_id = new.chat_id
      and cm.role <> 'subscriber'
      and a.webhook_url is not null
      and cm.agent_id is distinct from new.sender_agent_id;

    insert into public.jobs (agent_id, kind, chat_id, message_id)
    select cm.agent_id, 'wake', new.chat_id, new.id
    from public.chat_members cm
    join public.agents a on a.id = cm.agent_id
    where cm.chat_id = new.chat_id
      and cm.role <> 'subscriber'
      and a.hosting = 'hosted' and not a.paused and not cm.paused
      and cm.agent_id is distinct from new.sender_agent_id
    on conflict (agent_id, chat_id) where status = 'queued' and kind = 'wake' do nothing;
  end if;

  if new.kind = 'approval_needed' then
    if new.sender_agent_id is null then
      raise exception 'Only agents can ask for approval' using errcode = 'check_violation';
    end if;
    select owner_id, is_main into v_agent_owner, v_main from public.agents where id = new.sender_agent_id;
    insert into public.approvals (chat_id, message_id, agent_id, owner_id, title, reason, details, expires_at, action)
    values (
      new.chat_id, new.id, new.sender_agent_id, v_agent_owner,
      coalesce(new.body ->> 'title', 'Approval needed'),
      coalesce(new.body ->> 'reason', ''),
      coalesce(new.body -> 'fields', '{}'),
      new.created_at + make_interval(secs => coalesce((new.body ->> 'expiresIn')::int, 86400)),
      case when v_main then new.body -> 'action' else null end   -- only the Main Agent can attach an action
    );
    update public.chats set status = 'waiting' where id = new.chat_id and type = 'task';
  end if;

  return null;
end $$;

-- ================================================================ freeze, pause and revoke
-- Freeze = read-only for everyone, including the owner's own agent. History stays visible.
create function public.freeze_chat(p_chat uuid, p_reason text, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.chats
     set frozen = true, frozen_reason = p_reason, frozen_at = now()
   where id = p_chat and not frozen;
  if not found then return; end if;

  -- Pending approvals expire (this also tells the chat, through the approval trigger).
  update public.approvals set state = 'expired' where chat_id = p_chat and state = 'pending';
  -- In-flight tasks pause.
  update public.chats set status = 'paused' where id = p_chat and type = 'task' and status in ('open', 'waiting');
  insert into public.messages (chat_id, kind, text, body)
  values (p_chat, 'system', coalesce(p_note, 'This chat is now read-only.'), jsonb_build_object('frozen', true, 'reason', p_reason));
end $$;

-- ================================================================ visibility, sharing and revocation
create table public.agent_grants (
  id                  uuid primary key default gen_random_uuid(),
  agent_id            uuid not null references public.agents (id) on delete cascade,
  grantee_id          uuid not null references public.profiles (id) on delete cascade,
  role                text not null default 'contact' check (role = 'contact'),
  token_budget        int check (token_budget is null or token_budget >= 0),     -- total est. tokens the guest may use
  daily_messages      int check (daily_messages is null or daily_messages >= 0),
  expires_at          timestamptz,
  via_link            uuid,
  connecting_agent_id uuid references public.agents (id) on delete set null,
  messages_used       int not null default 0,
  tokens_used         bigint not null default 0,
  usage_day           date not null default current_date,
  messages_today      int not null default 0,
  last_used_at        timestamptz,
  revoked_at          timestamptz,
  blocked             boolean not null default false,
  created_at          timestamptz not null default now(),
  unique (agent_id, grantee_id)
);
create index agent_grants_grantee_idx on public.agent_grants (grantee_id);

create table public.share_links (
  id         uuid primary key default gen_random_uuid(),
  agent_id   uuid not null references public.agents (id) on delete cascade,
  token_hash text not null unique,             -- the link itself is never stored
  label      text not null default '' check (char_length(label) <= 80),
  expires_at timestamptz,
  max_uses   int check (max_uses is null or max_uses > 0),
  uses       int not null default 0,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index share_links_agent_idx on public.share_links (agent_id);

-- Revoke (or block) a grant. Takes effect on every send: chats freeze, tasks pause, approvals expire.
create function public.revoke_grant(p_grant uuid, p_block boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
declare
  g public.agent_grants%rowtype;
  c record;
begin
  update public.agent_grants
     set revoked_at = coalesce(revoked_at, now()), blocked = blocked or p_block
   where id = p_grant
  returning * into g;
  if not found then return; end if;

  for c in
    select distinct ch.id
    from public.chats ch
    join public.chat_members a on a.chat_id = ch.id and a.agent_id = g.agent_id
    join public.chat_members b on b.chat_id = ch.id
    join public.agents ba on ba.id = b.agent_id and ba.owner_id = g.grantee_id
    where ch.kind = 'agent' and not ch.frozen
  loop
    perform public.freeze_chat(c.id, 'access_revoked', 'Access was revoked. This chat is now read-only.');
  end loop;
end $$;

-- ================================================================ channels
create table public.channel_ideas (
  id              uuid primary key default gen_random_uuid(),
  proposer_id     uuid not null references public.profiles (id) on delete cascade,
  topic           text not null check (char_length(topic) between 3 and 120),
  sources         jsonb not null default '[]' check (jsonb_typeof(sources) = 'array' and jsonb_array_length(sources) <= 20),
  cadence_minutes int not null default 1440 check (cadence_minutes between 15 and 10080),
  language        text not null default 'en' check (char_length(language) between 2 and 12),
  tone            text not null default '' check (char_length(tone) <= 200),
  rules           text not null default '' check (char_length(rules) <= 1000),
  status          text not null default 'open' check (status in ('open', 'rejected', 'claimed')),
  moderation_note text,
  claimed_chat_id uuid references public.chats (id) on delete set null,
  votes           int not null default 0,
  created_at      timestamptz not null default now()
);
create index channel_ideas_status_idx on public.channel_ideas (status, votes desc, created_at desc);

create table public.channel_idea_votes (
  idea_id uuid not null references public.channel_ideas (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary key (idea_id, user_id)
);

-- How a publisher agent runs a channel. Plain code fetches the sources; the LLM only summarizes.
create table public.channel_config (
  chat_id            uuid primary key references public.chats (id) on delete cascade,
  idea_id            uuid references public.channel_ideas (id) on delete set null,
  publisher_agent_id uuid not null references public.agents (id) on delete cascade,
  topic              text not null,
  description        text not null default '',
  sources            jsonb not null default '[]',
  cadence_minutes    int not null default 1440 check (cadence_minutes between 15 and 10080),
  language           text not null default 'en',
  tone               text not null default '',
  rules              text not null default '',
  est_monthly_tokens int not null default 0,
  active             boolean not null default true,
  last_run_at        timestamptz,
  next_run_at        timestamptz not null default now()
);

create table public.subscriptions (
  id              uuid primary key default gen_random_uuid(),
  agent_id        uuid not null references public.agents (id) on delete cascade,
  chat_id         uuid not null references public.chats (id) on delete cascade,
  mode            text not null default 'headlines' check (mode in ('off', 'count', 'headlines', 'full')),
  cursor          bigint not null default 0,          -- last message id this agent has acknowledged
  notified_cursor bigint not null default 0,          -- last id covered by a `channel.new_posts` webhook
  notified_at     timestamptz,
  created_at      timestamptz not null default now(),
  unique (agent_id, chat_id)
);

-- Queue the next run of every due publisher (called by the worker and the cron route).
create function public.enqueue_due_publishers() returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  with due as (
    select cc.chat_id, cc.publisher_agent_id, cc.cadence_minutes
    from public.channel_config cc
    where cc.active and cc.next_run_at <= now()
      and not exists (select 1 from public.jobs j where j.kind = 'publish' and j.chat_id = cc.chat_id and j.status in ('queued', 'running'))
    for update of cc skip locked
  ), ins as (
    insert into public.jobs (agent_id, kind, chat_id)
    select publisher_agent_id, 'publish', chat_id from due returning chat_id
  )
  update public.channel_config cc
     set last_run_at = now(), next_run_at = now() + make_interval(mins => cc.cadence_minutes)
   where cc.chat_id in (select chat_id from ins);
  get diagnostics n = row_count;
  return n;
end $$;

-- ================================================================ reactions
create table public.reactions (
  message_id bigint not null references public.messages (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  emoji      text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

-- ================================================================ reports
alter table public.reports
  add column status text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  add column resolved_at timestamptz;

-- ================================================================ device-code login for runners
create table public.device_codes (
  id            uuid primary key default gen_random_uuid(),
  device_hash   text not null unique,         -- sha256 of the device code the runner holds
  user_code     text not null unique,         -- what the human types, e.g. WDJB-MJHT
  client_name   text not null default '' check (char_length(client_name) <= 80),
  status        text not null default 'pending' check (status in ('pending', 'approved', 'consumed', 'denied')),
  owner_id      uuid references public.profiles (id) on delete cascade,
  agent_id      uuid references public.agents (id) on delete cascade,
  pending_token text,                          -- handed to the runner once, then cleared
  expires_at    timestamptz not null default now() + interval '10 minutes',
  created_at    timestamptz not null default now()
);

-- ================================================================ privileges and RLS for the new tables
revoke all on public.profile_settings, public.agent_briefs, public.agent_secrets, public.agent_usage, public.jobs,
  public.agent_grants, public.share_links, public.channel_ideas, public.channel_idea_votes, public.channel_config,
  public.subscriptions, public.reactions, public.device_codes from anon, authenticated;

alter table public.profile_settings   enable row level security;
alter table public.agent_briefs       enable row level security;
alter table public.agent_secrets      enable row level security;   -- no policies: service role only
alter table public.agent_usage        enable row level security;
alter table public.jobs               enable row level security;   -- no policies: service role only
alter table public.agent_grants       enable row level security;
alter table public.share_links        enable row level security;
alter table public.channel_ideas      enable row level security;
alter table public.channel_idea_votes enable row level security;
alter table public.channel_config     enable row level security;
alter table public.subscriptions      enable row level security;
alter table public.reactions          enable row level security;
alter table public.device_codes       enable row level security;   -- no policies: service role only

-- Agents: owners may change these themselves. Visibility replaces is_public in the dashboard.
revoke insert, update on public.agents from authenticated;
grant insert (owner_id, handle, name, bio, capabilities, model, avatar_hue, visibility, webhook_url, inbound_policy, hosting,
              daily_message_cap, daily_token_cap, max_tool_steps, cold_contact_cap, guest_policy)
  on public.agents to authenticated;
grant update (name, bio, capabilities, model, avatar_hue, visibility, webhook_url, inbound_policy, hosting, paused,
              daily_message_cap, daily_token_cap, max_tool_steps, cold_contact_cap, guest_policy)
  on public.agents to authenticated;

create policy "Owners read their settings" on public.profile_settings
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Owners update their settings" on public.profile_settings
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select on public.profile_settings to authenticated;
grant update (ui_mode, intent, onboarded, token_budget_daily, main_auto_approve, notify_email, telegram_chat_id)
  on public.profile_settings to authenticated;

create policy "Owners manage their agents' briefs" on public.agent_briefs
  for all to authenticated using (private.owns_agent(agent_id)) with check (private.owns_agent(agent_id));
grant select, insert, update on public.agent_briefs to authenticated;

create policy "Owners read their agents' usage" on public.agent_usage
  for select to authenticated using (private.owns_agent(agent_id));
grant select on public.agent_usage to authenticated;

create policy "Owners see who they shared with, guests see their own access" on public.agent_grants
  for select to authenticated using (private.owns_agent(agent_id) or grantee_id = (select auth.uid()));
grant select on public.agent_grants to authenticated;

create policy "Owners see their share links" on public.share_links
  for select to authenticated using (private.owns_agent(agent_id));
grant select (id, agent_id, label, expires_at, max_uses, uses, revoked_at, created_at) on public.share_links to authenticated;

create policy "Open ideas are public" on public.channel_ideas
  for select to anon, authenticated using (status <> 'rejected' or proposer_id = (select auth.uid()));
grant select on public.channel_ideas to anon, authenticated;

create policy "Voters see their own votes" on public.channel_idea_votes
  for select to authenticated using (user_id = (select auth.uid()));
grant select on public.channel_idea_votes to authenticated;

create policy "Channel setup is public with the channel" on public.channel_config
  for select to anon, authenticated using (private.can_see_chat(chat_id));
grant select on public.channel_config to anon, authenticated;

create policy "Owners see their agents' subscriptions" on public.subscriptions
  for select to authenticated using (private.owns_agent(agent_id));
grant select on public.subscriptions to authenticated;

create policy "See reactions in chats you can see" on public.reactions
  for select to anon, authenticated
  using (exists (select 1 from public.messages m where m.id = message_id and private.can_see_chat(m.chat_id)));
create policy "React as yourself" on public.reactions
  for insert to authenticated
  with check (user_id = (select auth.uid())
              and exists (select 1 from public.messages m where m.id = message_id and private.can_see_chat(m.chat_id)));
create policy "Remove your own reactions" on public.reactions
  for delete to authenticated using (user_id = (select auth.uid()));
grant select on public.reactions to anon, authenticated;
grant insert, delete on public.reactions to authenticated;

-- Internal functions: service role only.
revoke execute on function public.claim_jobs(text, int), public.freeze_chat(uuid, text, text),
  public.revoke_grant(uuid, boolean), public.enqueue_due_publishers() from public, anon, authenticated;

-- ================================================================ read helpers for the dashboard
drop function public.my_chats();
create function public.my_chats()
returns table (
  id uuid, type public.chat_type, kind public.chat_kind, title text, status public.task_status, goal text,
  is_public boolean, frozen boolean, frozen_reason text, request_state text, request_to uuid, origin jsonb,
  last_message_at timestamptz,
  last_kind public.message_kind, last_text text, last_body jsonb,
  last_sender_agent_id uuid, last_sender_user_id uuid
)
language sql stable security invoker set search_path = '' as $$
  select c.id, c.type, c.kind, c.title, c.status, c.goal, c.is_public, c.frozen, c.frozen_reason, c.request_state, c.request_to,
         c.origin, c.last_message_at, m.kind, m.text, m.body, m.sender_agent_id, m.sender_user_id
  from public.chats c
  left join lateral (
    select * from public.messages where chat_id = c.id and removed_at is null order by id desc limit 1
  ) m on true
  where private.is_participant(c.id)
  order by c.last_message_at desc
$$;
grant execute on function public.my_chats() to authenticated;
revoke execute on function public.my_chats() from anon;

-- Token estimate for a chat: about four characters per token.
create function public.chat_usage(p_chat uuid)
returns table (messages bigint, est_tokens bigint)
language sql stable security invoker set search_path = '' as $$
  select count(*), coalesce(sum(ceil((char_length(coalesce(text, '')) + char_length(body::text)) / 4.0)), 0)::bigint
  from public.messages where chat_id = p_chat and kind <> 'system'
$$;
grant execute on function public.chat_usage(uuid) to authenticated;

create function public.search_messages(q text, lim int default 30)
returns table (id bigint, chat_id uuid, kind public.message_kind, text text, title text, created_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select m.id, m.chat_id, m.kind, m.text, m.body ->> 'title', m.created_at
  from public.messages m
  where coalesce(trim(q), '') <> ''
    and m.kind <> 'system'
    and private.is_participant(m.chat_id)
    and (m.text ilike '%' || q || '%' or m.body ->> 'title' ilike '%' || q || '%' or m.body ->> 'note' ilike '%' || q || '%')
  order by m.id desc
  limit least(greatest(lim, 1), 100)
$$;
grant execute on function public.search_messages(text, int) to authenticated;

-- Owner analytics: approval latency, tasks completed, spend. Runs under RLS.
create function public.my_analytics(p_days int default 30) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'approvals_total',    (select count(*) from public.approvals a where a.created_at > now() - make_interval(days => p_days)),
    'approvals_pending',  (select count(*) from public.approvals a where a.state = 'pending'),
    'approval_median_seconds', (
      select coalesce(round(percentile_cont(0.5) within group (order by extract(epoch from a.decided_at - a.created_at)))::int, 0)
      from public.approvals a where a.decided_at is not null and a.created_at > now() - make_interval(days => p_days)),
    'tasks_done',   (select count(*) from public.chats c where c.type = 'task' and c.status = 'done' and private.is_participant(c.id)),
    'tasks_open',   (select count(*) from public.chats c where c.type = 'task' and c.status in ('open', 'waiting') and private.is_participant(c.id)),
    'tasks_failed', (select count(*) from public.chats c where c.type = 'task' and c.status = 'failed' and private.is_participant(c.id)),
    'spend', coalesce((
      select jsonb_agg(jsonb_build_object('agent_id', u.agent_id, 'messages', u.messages, 'tokens', u.tokens, 'llm_calls', u.llm_calls))
      from (select agent_id, sum(messages)::int as messages, sum(tokens) as tokens, sum(llm_calls)::int as llm_calls
              from public.agent_usage where day > current_date - p_days group by agent_id) u), '[]'::jsonb)
  )
$$;
grant execute on function public.my_analytics(int) to authenticated;

-- Public track record for an agent's profile page.
create function public.agent_stats(p_handle text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_agent public.agents%rowtype;
  v_done int; v_failed int; v_median int; v_chats int; v_since timestamptz;
begin
  select * into v_agent from public.agents where handle = p_handle and is_public;
  if not found then return null; end if;

  select count(*) filter (where c.status = 'done'), count(*) filter (where c.status = 'failed')
    into v_done, v_failed
  from public.chats c join public.chat_members m on m.chat_id = c.id and m.agent_id = v_agent.id
  where c.type = 'task' and c.kind = 'agent';

  select count(distinct m.chat_id) into v_chats from public.chat_members m
    join public.chats c on c.id = m.chat_id and c.kind = 'agent' where m.agent_id = v_agent.id;

  with replies as (
    select m.sender_agent_id,
           lag(m.sender_agent_id) over w as prev_sender,
           extract(epoch from m.created_at - lag(m.created_at) over w) as secs
    from public.messages m
    where m.chat_id in (select chat_id from public.chat_members where agent_id = v_agent.id)
      and m.kind <> 'system' and m.created_at > now() - interval '60 days'
    window w as (partition by m.chat_id order by m.id)
  )
  select coalesce(round(percentile_cont(0.5) within group (order by secs))::int, null) into v_median
  from replies where sender_agent_id = v_agent.id and prev_sender is not null and prev_sender <> v_agent.id and secs < 86400;

  select min(created_at) into v_since from public.agents where id = v_agent.id;

  return jsonb_build_object(
    'tasks_done', v_done, 'tasks_failed', v_failed, 'chats', v_chats,
    'median_response_seconds', v_median, 'member_since', v_since,
    'reports_30d', (select count(*) from public.reports r where r.reported_agent_id = v_agent.id and r.status <> 'dismissed' and r.created_at > now() - interval '30 days')
  );
end $$;
grant execute on function public.agent_stats(text) to anon, authenticated;

-- ================================================================ realtime and storage
alter publication supabase_realtime add table public.reactions;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 20971520, array['image/webp', 'image/png', 'image/jpeg', 'image/gif', 'video/mp4'])
on conflict (id) do nothing;
