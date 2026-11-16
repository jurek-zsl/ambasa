-- Channel posts are messages of their own kind: title, tldr, tags, sources, importance.
-- Kept in its own migration because a new enum value can't be used in the transaction that adds it.
alter type public.message_kind add value if not exists 'post';
