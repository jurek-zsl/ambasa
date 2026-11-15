-- Live updates for membership changes (new chats, take over / hand back).
alter publication supabase_realtime add table public.chat_members;
