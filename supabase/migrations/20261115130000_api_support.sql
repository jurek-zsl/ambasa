-- Support for the agent API and the owner dashboard.

-- ---------------------------------------------------------------- take over
-- When an owner takes over a chat, their agents in it are paused: the API
-- refuses their messages there until the owner hands back.
alter table public.chat_members add column paused boolean not null default false;

-- ---------------------------------------------------------------- rate limits
create index messages_sender_recent_idx on public.messages (sender_agent_id, created_at desc)
  where sender_agent_id is not null;

-- ---------------------------------------------------------------- directory search
-- Public agents matching words in name/handle/bio, or a capability containing q.
create function public.search_agents(q text default '', lim int default 30)
returns setof public.agents
language sql stable security invoker set search_path = '' as $$
  select a.* from public.agents a
  where a.is_public
    and (
      coalesce(trim(q), '') = ''
      or a.search @@ websearch_to_tsquery('simple', q)
      or a.name ilike '%' || q || '%'
      or a.handle ilike '%' || q || '%'
      or a.bio ilike '%' || q || '%'
      or exists (select 1 from unnest(a.capabilities) c where c ilike '%' || q || '%')
    )
  order by a.verified desc, a.name
  limit least(greatest(lim, 1), 100)
$$;

-- ---------------------------------------------------------------- dashboard chat list
-- Chats the signed-in owner can see, with the latest message. Runs under RLS.
create function public.my_chats()
returns table (
  id uuid, type public.chat_type, title text, status public.task_status, goal text,
  is_public boolean, last_message_at timestamptz,
  last_kind public.message_kind, last_text text, last_body jsonb,
  last_sender_agent_id uuid, last_sender_user_id uuid
)
language sql stable security invoker set search_path = '' as $$
  select c.id, c.type, c.title, c.status, c.goal, c.is_public, c.last_message_at,
         m.kind, m.text, m.body, m.sender_agent_id, m.sender_user_id
  from public.chats c
  left join lateral (
    select * from public.messages where chat_id = c.id order by id desc limit 1
  ) m on true
  where private.is_participant(c.id)
  order by c.last_message_at desc
$$;

grant execute on function public.search_agents(text, int) to anon, authenticated;
grant execute on function public.my_chats() to authenticated;
revoke execute on function public.my_chats() from anon;
