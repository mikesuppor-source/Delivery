-- 033_integrations.sql
-- Phase 7: what a shop's own systems need to talk to Cedar.
--
-- 1. shop_api_keys: keys for the shop API (/api/v1). Only a SHA-256 hash is stored; the key itself is
--    shown once, when it is made. A shop can have several keys and revoke any of them.
-- 2. shop_webhooks and webhook_deliveries: the web address a shop wants told about its orders, the
--    secret used to sign each message, and a queue of messages with retries. A database trigger queues
--    them whenever an order changes status, so every path (desk, courier phone, server functions)
--    is covered without any app code having to remember.
-- 3. orders.external_ref: the shop's own order number, unique per shop, so a shop that sends the same
--    order twice does not get two deliveries.
--
-- All three tables are for the server only (row level security on, no access for anon or authenticated).

begin;

alter table public.orders add column external_ref text check (external_ref is null or length(external_ref) between 1 and 100);
create unique index orders_shop_external_ref_idx on public.orders (shop_id, external_ref) where external_ref is not null;

create table public.shop_api_keys (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null default 'API key' check (length(name) between 1 and 80),
  key_prefix text not null check (length(key_prefix) between 4 and 16),
  key_hash text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index shop_api_keys_shop_idx on public.shop_api_keys (shop_id);

create table public.shop_webhooks (
  shop_id uuid primary key references public.shops(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  url text not null check (url ~ '^https?://' and length(url) <= 500),
  secret text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete cascade,
  event text not null check (event in ('order.status_changed', 'order.delivered', 'order.returned', 'payout.paid')),
  order_id uuid references public.orders(id) on delete set null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'delivered', 'failed')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_status_code integer,
  last_error text,
  created_at timestamptz not null default now(),
  delivered_at timestamptz
);
create index webhook_deliveries_due_idx on public.webhook_deliveries (next_attempt_at) where status = 'pending';
create index webhook_deliveries_shop_idx on public.webhook_deliveries (shop_id, created_at desc);

alter table public.shop_api_keys enable row level security;
alter table public.shop_webhooks enable row level security;
alter table public.webhook_deliveries enable row level security;
revoke all on public.shop_api_keys, public.shop_webhooks, public.webhook_deliveries from public, anon, authenticated;
grant all on public.shop_api_keys, public.shop_webhooks, public.webhook_deliveries to service_role;

-- Queue one message for a shop, if that shop has an active webhook.
create function public.enqueue_shop_webhook(p_shop uuid, p_event text, p_order uuid, p_payload jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.webhook_deliveries (workspace_id, shop_id, event, order_id, payload)
  select w.workspace_id, w.shop_id, p_event, p_order, p_payload
  from public.shop_webhooks w
  where w.shop_id = p_shop and w.enabled;
end $$;

-- Every change of an order's status queues "order.status_changed", plus a specific message for delivered and returned.
create function public.queue_order_webhooks() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare body jsonb;
begin
  if new.shop_id is null or new.status is not distinct from old.status then return new; end if;
  body := jsonb_build_object(
    'code', new.code, 'status', new.status, 'previousStatus', old.status,
    'externalReference', new.external_ref, 'changedAt', now());
  perform public.enqueue_shop_webhook(new.shop_id, 'order.status_changed', new.id, body);
  if new.status = 'delivered' then
    perform public.enqueue_shop_webhook(new.shop_id, 'order.delivered', new.id,
      body || jsonb_build_object('collectedUsd', new.pod_collected_usd, 'collectedLbp', new.pod_collected_lbp));
  elsif new.status = 'returned' then
    perform public.enqueue_shop_webhook(new.shop_id, 'order.returned', new.id, body);
  end if;
  return new;
end $$;
create trigger order_status_webhooks after update of status on public.orders
  for each row execute function public.queue_order_webhooks();

-- The server asks for the messages that are due. Each one is handed out once and leased for five
-- minutes, so two overlapping runs never send the same message twice. Messages for a webhook that was
-- removed or switched off are failed here, with a reason. Old finished messages are cleared after 30 days.
create function public.claim_webhook_deliveries(p_limit integer)
returns table (id uuid, shop_id uuid, event text, payload jsonb, attempts integer, created_at timestamptz, url text, secret text)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  delete from public.webhook_deliveries d where d.status <> 'pending' and d.created_at < now() - interval '30 days';
  update public.webhook_deliveries d
     set status = 'failed', last_error = 'Webhook switched off or removed'
   where d.status = 'pending' and d.next_attempt_at <= now()
     and not exists (select 1 from public.shop_webhooks w where w.shop_id = d.shop_id and w.enabled);
  return query
  with due as (
    select d.id from public.webhook_deliveries d
    where d.status = 'pending' and d.next_attempt_at <= now()
    order by d.next_attempt_at limit greatest(1, least(p_limit, 100))
    for update skip locked
  ), leased as (
    update public.webhook_deliveries d set next_attempt_at = now() + interval '5 minutes'
    from due where d.id = due.id
    returning d.id, d.shop_id, d.event, d.payload, d.attempts, d.created_at
  )
  select l.id, l.shop_id, l.event, l.payload, l.attempts, l.created_at, w.url, w.secret
  from leased l join public.shop_webhooks w on w.shop_id = l.shop_id
  order by l.created_at;
end $$;

-- The server reports what happened. A failure is tried again after 1 minute, 5, 15, 60, 3 hours, 6, 12
-- and 24 hours; the eighth failure gives up.
create function public.complete_webhook_delivery(p_id uuid, p_ok boolean, p_status integer, p_error text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_ok then
    update public.webhook_deliveries
       set status = 'delivered', delivered_at = now(), attempts = attempts + 1, last_status_code = p_status, last_error = null
     where id = p_id;
  else
    update public.webhook_deliveries
       set attempts = attempts + 1,
           last_status_code = p_status,
           last_error = left(coalesce(p_error, 'Failed'), 300),
           status = case when attempts + 1 >= 8 then 'failed' else 'pending' end,
           next_attempt_at = now() + (array[1, 5, 15, 60, 180, 360, 720, 1440])[least(attempts + 1, 8)] * interval '1 minute'
     where id = p_id;
  end if;
end $$;

revoke all on function public.enqueue_shop_webhook(uuid, text, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.queue_order_webhooks() from public, anon, authenticated;
revoke all on function public.claim_webhook_deliveries(integer) from public, anon, authenticated;
revoke all on function public.complete_webhook_delivery(uuid, boolean, integer, text) from public, anon, authenticated;
grant execute on function public.enqueue_shop_webhook(uuid, text, uuid, jsonb) to service_role;
grant execute on function public.queue_order_webhooks() to service_role;
grant execute on function public.claim_webhook_deliveries(integer) to service_role;
grant execute on function public.complete_webhook_delivery(uuid, boolean, integer, text) to service_role;

commit;
