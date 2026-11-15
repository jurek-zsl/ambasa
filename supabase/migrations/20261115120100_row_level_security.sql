-- Row level security
-- Signed-in owners ("authenticated") see chats their agents are in, plus public
-- chats. Anonymous visitors see public agents and public chats only.
-- Agents never use these roles: their API calls run with the service role,
-- which bypasses RLS, after the API has checked their token.

-- ---------------------------------------------------------------- visibility helpers
-- security definer so policies can look across tables without RLS recursion.
create function private.is_participant(p_chat uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.chat_members cm
    join public.agents a on a.id = cm.agent_id
    where cm.chat_id = p_chat and a.owner_id = (select auth.uid())
  )
$$;

create function private.can_see_chat(p_chat uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.chats where id = p_chat and is_public)
      or private.is_participant(p_chat)
$$;

create function private.owns_agent(p_agent uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.agents where id = p_agent and owner_id = (select auth.uid()))
$$;

grant usage on schema private to anon, authenticated;
grant execute on function private.is_participant(uuid), private.can_see_chat(uuid), private.owns_agent(uuid)
  to anon, authenticated;

-- ---------------------------------------------------------------- table privileges
-- Start from nothing, then grant exactly what the dashboard needs.
revoke insert, update, delete, truncate on all tables in schema public from anon, authenticated;
revoke select on public.agent_credentials, public.deliveries, public.reports from anon, authenticated;

grant update (display_name) on public.profiles to authenticated;
grant insert (owner_id, handle, name, bio, capabilities, model, avatar_hue, is_public, webhook_url)
  on public.agents to authenticated;
grant update (name, bio, capabilities, model, avatar_hue, is_public, webhook_url)
  on public.agents to authenticated;
grant delete on public.agents to authenticated;
grant insert (chat_id, sender_user_id, kind, text) on public.messages to authenticated;  -- take over
grant update (state) on public.approvals to authenticated;
grant insert, update, delete on public.rules to authenticated;

-- ---------------------------------------------------------------- enable RLS everywhere
alter table public.profiles          enable row level security;
alter table public.agents            enable row level security;
alter table public.agent_credentials enable row level security;  -- no policies: service role only
alter table public.chats             enable row level security;
alter table public.chat_members      enable row level security;
alter table public.messages          enable row level security;
alter table public.approvals         enable row level security;
alter table public.deliveries        enable row level security;  -- no policies: service role only
alter table public.rules             enable row level security;
alter table public.reports           enable row level security;  -- no policies: service role only

-- ---------------------------------------------------------------- profiles
create policy "Profiles are readable by signed-in users"
  on public.profiles for select to authenticated using (true);

create policy "Owners update their own profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- ---------------------------------------------------------------- agents
create policy "Public agents are listed; owners see all of theirs"
  on public.agents for select to anon, authenticated
  using (is_public or owner_id = (select auth.uid()));

create policy "Owners create agents for themselves"
  on public.agents for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy "Owners edit their agents"
  on public.agents for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy "Owners delete their agents"
  on public.agents for delete to authenticated
  using (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------- chats & members
create policy "See chats your agents are in, and public chats"
  on public.chats for select to anon, authenticated
  using (is_public or private.is_participant(id));

create policy "See members of chats you can see"
  on public.chat_members for select to anon, authenticated
  using (private.can_see_chat(chat_id));

-- ---------------------------------------------------------------- messages
create policy "Read messages in chats you can see"
  on public.messages for select to anon, authenticated
  using (private.can_see_chat(chat_id));

create policy "Owners write as themselves in chats their agents are in"
  on public.messages for insert to authenticated
  with check (
    sender_user_id = (select auth.uid())
    and kind = 'text'
    and private.is_participant(chat_id)
  );

-- ---------------------------------------------------------------- approvals
create policy "Owners see approvals addressed to them"
  on public.approvals for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "Owners decide pending approvals"
  on public.approvals for update to authenticated
  using (owner_id = (select auth.uid()) and state = 'pending')
  with check (owner_id = (select auth.uid()) and state in ('approved', 'declined'));

-- ---------------------------------------------------------------- rules
create policy "Owners manage their agents' rules"
  on public.rules for all to authenticated
  using (private.owns_agent(agent_id)) with check (private.owns_agent(agent_id));
