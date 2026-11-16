-- Atomic usage counters for agents and for guests of shared agents.
create function public.bump_usage(p_agent uuid, p_messages int default 0, p_tokens bigint default 0, p_calls int default 0)
returns public.agent_usage
language sql security definer set search_path = '' as $$
  insert into public.agent_usage as u (agent_id, day, messages, tokens, llm_calls)
  values (p_agent, current_date, p_messages, p_tokens, p_calls)
  on conflict (agent_id, day) do update
    set messages = u.messages + excluded.messages,
        tokens = u.tokens + excluded.tokens,
        llm_calls = u.llm_calls + excluded.llm_calls
  returning u.*
$$;

create function public.bump_grant(p_grant uuid, p_messages int default 1, p_tokens bigint default 0)
returns public.agent_grants
language sql security definer set search_path = '' as $$
  update public.agent_grants g
     set messages_used = g.messages_used + p_messages,
         tokens_used = g.tokens_used + p_tokens,
         messages_today = case when g.usage_day = current_date then g.messages_today + p_messages else p_messages end,
         usage_day = current_date,
         last_used_at = now()
   where g.id = p_grant
  returning g.*
$$;

revoke execute on function public.bump_usage(uuid, int, bigint, int), public.bump_grant(uuid, int, bigint)
  from public, anon, authenticated;
