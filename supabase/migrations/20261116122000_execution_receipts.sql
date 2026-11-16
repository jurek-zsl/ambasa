-- Decisions remain immutable. Only a pending execution receipt may be finalized afterwards.
create or replace function private.guard_approval_update() returns trigger
language plpgsql set search_path='' as $$
begin
  if old.state <> 'pending' then
    if old.state='approved' and old.execution_state='pending'
      and new.execution_state in ('succeeded','failed')
      and (to_jsonb(new)-array['execution_state','execution_detail'])=(to_jsonb(old)-array['execution_state','execution_detail']) then
      return new;
    end if;
    raise exception 'This approval was already decided' using errcode='check_violation';
  end if;
  if new.state='pending' then return new; end if;
  new.decided_at:=now();
  new.decided_by:=coalesce(auth.uid(),new.decided_by);
  new.title:=old.title;new.reason:=old.reason;new.details:=old.details;
  new.agent_id:=old.agent_id;new.owner_id:=old.owner_id;new.chat_id:=old.chat_id;
  new.message_id:=old.message_id;new.expires_at:=old.expires_at;new.action:=old.action;
  return new;
end $$;
