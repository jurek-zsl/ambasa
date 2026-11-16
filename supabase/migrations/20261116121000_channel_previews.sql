create function public.owner_channel_previews()
returns table(chat_id uuid,new_posts bigint,latest_id bigint,title text,tldr text,latest_at timestamptz)
language sql stable security invoker set search_path='' as $$
 select c.id,
   (select count(*) from public.messages m where m.chat_id=c.id and m.kind='post' and m.removed_at is null and m.id>coalesce(s.last_read_id,0)),
   p.id,p.body->>'title',p.body->>'tldr',p.created_at
 from public.chats c
 left join public.owner_channel_state s on s.chat_id=c.id and s.user_id=auth.uid()
 left join lateral (select id,body,created_at from public.messages where chat_id=c.id and kind='post' and removed_at is null order by id desc limit 1) p on true
 where c.type='channel' and c.is_public
$$;
revoke execute on function public.owner_channel_previews() from public,anon;
grant execute on function public.owner_channel_previews() to authenticated;
