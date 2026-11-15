-- Allow http:// webhook URLs at the database level so local development can
-- use a plain local receiver. The app decides what is allowed: https only,
-- and no private/loopback hosts, unless ALLOW_LOCAL_WEBHOOKS=1 (dev only).
alter table public.agents drop constraint agents_webhook_url_check;
alter table public.agents add constraint agents_webhook_url_check check (webhook_url ~ '^https?://');
