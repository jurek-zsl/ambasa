-- Owner uploads stay private; only authenticated API routes can read their objects.
insert into storage.buckets(id,name,public,file_size_limit)
values ('owner-attachments','owner-attachments',false,20971520)
on conflict(id) do update set public=false,file_size_limit=20971520;

create table public.owner_attachments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  chat_id uuid not null references public.chats(id) on delete cascade,
  storage_path text not null unique,
  name text not null check(length(name) between 1 and 180),
  mime text not null check(length(mime) <= 100),
  size integer not null check(size between 1 and 20971520),
  type text not null check(type in ('image','gif','video','audio','file')),
  width integer,
  height integer,
  created_at timestamptz not null default now(),
  message_id bigint references public.messages(id) on delete cascade
);
alter table public.owner_attachments enable row level security;
grant select on public.owner_attachments to authenticated;
create policy "Owners see their own uploads" on public.owner_attachments
for select to authenticated using(owner_id=(select auth.uid()));
create index owner_attachment_pending on public.owner_attachments(owner_id,created_at) where message_id is null;

create function private.owner_attachment_quota() returns trigger language plpgsql security definer set search_path='' as $$
declare v_bytes bigint; v_count int;
begin
  perform 1 from public.profiles where id=new.owner_id for update;
  select coalesce(sum(size),0),count(*) into v_bytes,v_count from public.owner_attachments
    where owner_id=new.owner_id and created_at > now()-interval '24 hours';
  if v_bytes+new.size > 268435456 or v_count >= 100 then
    raise exception 'Daily attachment allowance reached' using errcode='check_violation';
  end if;
  return new;
end $$;
create trigger owner_attachment_quota before insert on public.owner_attachments
for each row execute function private.owner_attachment_quota();

alter table public.messages add column owner_client_nonce uuid;
create unique index owner_message_nonce on public.messages(sender_user_id,owner_client_nonce) where owner_client_nonce is not null;

-- Lock, validate and bind uploads in the same transaction as their message.
create function public.send_owner_message(p_chat_id uuid,p_text text,p_attachment_ids uuid[],p_client_nonce uuid)
returns bigint language plpgsql security definer set search_path='' as $$
declare v_user uuid := auth.uid(); v_existing public.messages; v_id bigint;
  v_count int; v_attachments jsonb := '[]'; v_text text := btrim(p_text);
begin
  if v_user is null then raise exception 'Sign in first' using errcode='insufficient_privilege'; end if;
  perform 1 from public.profiles where id=v_user for update;
  if not exists(select 1 from public.chats c join public.chat_members cm on cm.chat_id=c.id
      join public.agents a on a.id=cm.agent_id
      where c.id=p_chat_id and c.kind='owner' and not c.frozen and a.owner_id=v_user) then
    raise exception 'Only your private agent chat accepts uploads and messages' using errcode='insufficient_privilege';
  end if;
  if p_client_nonce is null or p_attachment_ids is null or cardinality(p_attachment_ids)>10 or length(v_text)>8000
    or (v_text='' and cardinality(p_attachment_ids)=0) then
    raise exception 'Invalid message' using errcode='check_violation';
  end if;
  select * into v_existing from public.messages where sender_user_id=v_user and owner_client_nonce=p_client_nonce;
  if found then
    if v_existing.chat_id<>p_chat_id or v_existing.text<>coalesce(nullif(v_text,''),'Shared attachments.') then
      raise exception 'This send identifier was already used' using errcode='check_violation';
    end if;
    return v_existing.id;
  end if;
  perform 1 from public.owner_attachments where id=any(p_attachment_ids) order by id for update;
  select count(*) into v_count from public.owner_attachments
    where id=any(p_attachment_ids) and owner_id=v_user and chat_id=p_chat_id and message_id is null;
  if v_count<>cardinality(p_attachment_ids) then
    raise exception 'Attachment unavailable or already sent' using errcode='insufficient_privilege';
  end if;
  if v_count>0 then
    select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'type',u.type,'url','/api/attachments/'||u.id,'mime',u.mime,'size',u.size,
      'name',u.name,'alt',u.name,'width',u.width,'height',u.height,'private',true))
      order by array_position(p_attachment_ids,u.id)) into v_attachments
      from public.owner_attachments u where u.id=any(p_attachment_ids);
  end if;
  insert into public.messages(chat_id,sender_user_id,kind,text,attachments,owner_client_nonce)
    values(p_chat_id,v_user,'text',coalesce(nullif(v_text,''),'Shared attachments.'),v_attachments,p_client_nonce)
    returning id into v_id;
  update public.owner_attachments set message_id=v_id where id=any(p_attachment_ids);
  return v_id;
end $$;
revoke all on function public.send_owner_message(uuid,text,uuid[],uuid) from public,anon;
grant execute on function public.send_owner_message(uuid,text,uuid[],uuid) to authenticated;
