-- Owner workspace: durable reading state, reusable/recurring instructions, readiness, and usage receipts.
create table public.task_presets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  instructions text not null check (char_length(instructions) between 1 and 6000),
  interval_minutes int check (interval_minutes between 60 and 10080),
  enabled boolean not null default false,
  next_run_at timestamptz,
  last_run_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.owner_channel_state (
  user_id uuid not null references public.profiles(id) on delete cascade,
  chat_id uuid not null references public.chats(id) on delete cascade,
  last_read_id bigint not null default 0,
  notifications boolean not null default false,
  saved_ids bigint[] not null default '{}',
  primary key(user_id,chat_id)
);
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique check (char_length(endpoint) < 2048),
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create table public.agent_checks (
  agent_id uuid primary key references public.agents(id) on delete cascade,
  status text not null check(status in ('pending','succeeded','failed')),
  checked_at timestamptz not null default now(),
  detail text
);
create table public.model_usage (
  id bigint generated always as identity primary key,
  agent_id uuid not null references public.agents(id) on delete cascade,
  chat_id uuid references public.chats(id) on delete set null,
  provider text not null,
  model text not null,
  input_tokens int not null check(input_tokens >= 0),
  output_tokens int not null check(output_tokens >= 0),
  created_at timestamptz not null default now()
);
create index model_usage_owner_time on public.model_usage(agent_id,created_at desc);
create table public.model_rates (
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null,
  model text not null,
  input_per_million numeric not null check(input_per_million >= 0),
  output_per_million numeric not null check(output_per_million >= 0),
  primary key(user_id,provider,model)
);
alter table public.approvals add column execution_state text check(execution_state in ('pending','succeeded','failed')),
  add column execution_detail text;
alter table public.jobs drop constraint jobs_kind_check;
alter table public.jobs add constraint jobs_kind_check check(kind in ('wake','publish','probe'));
create unique index jobs_one_probe on public.jobs(agent_id) where kind='probe' and status in ('queued','running');

alter table public.task_presets enable row level security;
alter table public.owner_channel_state enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.agent_checks enable row level security;
alter table public.model_usage enable row level security;
alter table public.model_rates enable row level security;
revoke all on public.task_presets, public.owner_channel_state, public.push_subscriptions,
  public.agent_checks, public.model_usage, public.model_rates from anon,authenticated;
grant select on public.task_presets, public.owner_channel_state, public.agent_checks,public.model_usage,public.model_rates to authenticated;
create policy "Read own presets" on public.task_presets for select to authenticated using(user_id=auth.uid());
create policy "Read own channel state" on public.owner_channel_state for select to authenticated using(user_id=auth.uid());
create policy "Read own model rates" on public.model_rates for select to authenticated using(user_id=auth.uid());
create policy "Read own checks" on public.agent_checks for select to authenticated using(exists(select 1 from public.agents a where a.id=agent_id and a.owner_id=auth.uid()));
create policy "Read own model usage" on public.model_usage for select to authenticated using(exists(select 1 from public.agents a where a.id=agent_id and a.owner_id=auth.uid()));

-- Row locks prevent cron and the worker from starting the same occurrence twice.
-- Missed occurrences coalesce into one run; paused agents and missing keys wait, without spending tokens.
create function public.run_due_presets() returns int
language plpgsql security definer set search_path='' as $$
declare p public.task_presets%rowtype; c uuid; n int:=0;
begin
  for p in select t.* from public.task_presets t join public.agents a on a.id=t.agent_id
    where t.enabled and t.interval_minutes is not null and t.next_run_at<=now()
      and a.owner_id=t.user_id and not a.paused
      and ((a.hosting='hosted' and exists(select 1 from public.agent_secrets s where s.agent_id=a.id))
        or (a.hosting='runner' and a.runner_seen_at>now()-interval '2 minutes'))
    order by t.next_run_at limit 50 for update of t skip locked
  loop
    select id into c from public.chats where kind='owner' and created_by=p.agent_id;
    if c is not null then
      insert into public.messages(chat_id,sender_user_id,kind,text,body)
      values(c,p.user_id,'text',p.instructions,jsonb_build_object('preset_id',p.id,'scheduled',true));
      update public.task_presets set last_run_at=now(),next_run_at=now()+make_interval(mins=>p.interval_minutes) where id=p.id;
      n:=n+1;
    end if;
  end loop;
  return n;
end $$;
revoke execute on function public.run_due_presets() from public,anon,authenticated;
grant execute on function public.run_due_presets() to service_role;
