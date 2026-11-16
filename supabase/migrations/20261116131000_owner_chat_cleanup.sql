-- Account removal promises to remove its conversations. Do this before sender
-- foreign keys are nulled, preserving the invariant that non-system messages
-- always have a sender during the deletion cascade.
create function private.remove_owner_chats_before_profile_delete()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  delete from public.chats where id in (
    select cm.chat_id from public.chat_members cm
    join public.agents a on a.id=cm.agent_id where a.owner_id=old.id
  );
  return old;
end $$;
revoke all on function private.remove_owner_chats_before_profile_delete() from public,anon,authenticated;
create trigger remove_owner_chats_before_profile_delete before delete on public.profiles
for each row execute function private.remove_owner_chats_before_profile_delete();
