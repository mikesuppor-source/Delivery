-- Customer WhatsApp messages (out for delivery, delivered, delivery failed, held in the warehouse).
-- A change of an order's status, or a new warehouse hold, queues one message here. The server sends the queued
-- messages (right after the change, and again every few minutes) and reports what happened, so a message is
-- never lost when WhatsApp is slow or down. The "order confirmed" message is still sent when the order is made.
begin;

create table public.customer_message_queue (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  template text not null check (template in ('out_for_delivery', 'delivered', 'failed_attempt', 'held')),
  -- The same event is queued once: for example the same attempt can never announce "failed" twice.
  dedupe_key text not null unique,
  status text not null default 'pending' check (status in ('pending', 'sent', 'skipped', 'failed')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index customer_message_queue_due_idx on public.customer_message_queue (next_attempt_at) where status = 'pending';
create index customer_message_queue_order_idx on public.customer_message_queue (order_id);

alter table public.customer_message_queue enable row level security;
revoke all on public.customer_message_queue from public, anon, authenticated;
grant all on public.customer_message_queue to service_role;

-- Queue one message for an order, if the order has a phone number to send it to.
create function public.queue_customer_message(p_order uuid, p_template text, p_key text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_workspace uuid; v_phone text;
begin
  select workspace_id, nullif(btrim(recipient_phone), '') into v_workspace, v_phone from public.orders where id = p_order;
  if v_workspace is null or v_phone is null then return; end if;
  insert into public.customer_message_queue (workspace_id, order_id, template, dedupe_key)
  values (v_workspace, p_order, p_template, p_key)
  on conflict (dedupe_key) do nothing;
end $$;

-- A new status queues the matching message. The attempt count is part of the key, so a second delivery
-- attempt (or a second trip out) is announced again, but the same one never twice.
create function public.queue_order_customer_messages() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_attempts integer;
begin
  if new.status is not distinct from old.status then return new; end if;
  select count(*) into v_attempts from public.delivery_attempts where order_id = new.id;
  if new.status = 'picked_up' then
    perform public.queue_customer_message(new.id, 'out_for_delivery', new.id || ':out_for_delivery:' || v_attempts);
  elsif new.status = 'delivered' then
    perform public.queue_customer_message(new.id, 'delivered', new.id || ':delivered');
  elsif new.status = 'failed' then
    perform public.queue_customer_message(new.id, 'failed_attempt', new.id || ':failed_attempt:' || v_attempts);
  end if;
  return new;
end $$;
create trigger order_status_customer_messages after update of status on public.orders
  for each row execute function public.queue_order_customer_messages();

create function public.queue_hold_customer_message() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.queue_customer_message(new.order_id, 'held', new.order_id || ':held:' || new.id);
  return new;
end $$;
create trigger order_hold_customer_message after insert on public.order_holds
  for each row execute function public.queue_hold_customer_message();

-- The server asks for the messages that are due. Each is handed out once and leased for five minutes, so two
-- overlapping runs never send the same message twice. Finished messages are cleared after 30 days.
create function public.claim_customer_messages(p_limit integer)
returns table (id uuid, workspace_id uuid, order_id uuid, template text, attempts integer)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  delete from public.customer_message_queue q where q.status <> 'pending' and q.created_at < now() - interval '30 days';
  return query
  with due as (
    select q.id from public.customer_message_queue q
    where q.status = 'pending' and q.next_attempt_at <= now()
    order by q.next_attempt_at limit greatest(1, least(p_limit, 100))
    for update skip locked
  )
  update public.customer_message_queue q set next_attempt_at = now() + interval '5 minutes'
  from due where q.id = due.id
  returning q.id, q.workspace_id, q.order_id, q.template, q.attempts;
end $$;

-- The server reports what happened: 'sent', 'skipped' (no longer relevant, or switched off) or 'failed'.
-- A failure is tried again after 1 minute, 5, 15, 60 and 3 hours; the fifth failure gives up.
create function public.complete_customer_message(p_id uuid, p_outcome text, p_error text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_outcome in ('sent', 'skipped') then
    update public.customer_message_queue
       set status = p_outcome, attempts = attempts + 1, last_error = null, finished_at = now()
     where id = p_id;
  else
    update public.customer_message_queue
       set attempts = attempts + 1,
           last_error = left(coalesce(p_error, 'Failed'), 300),
           status = case when attempts + 1 >= 5 then 'failed' else 'pending' end,
           finished_at = case when attempts + 1 >= 5 then now() else null end,
           next_attempt_at = now() + (array[1, 5, 15, 60, 180])[least(attempts + 1, 5)] * interval '1 minute'
     where id = p_id;
  end if;
end $$;

revoke all on function public.queue_customer_message(uuid, text, text) from public, anon, authenticated;
revoke all on function public.queue_order_customer_messages() from public, anon, authenticated;
revoke all on function public.queue_hold_customer_message() from public, anon, authenticated;
revoke all on function public.claim_customer_messages(integer) from public, anon, authenticated;
revoke all on function public.complete_customer_message(uuid, text, text) from public, anon, authenticated;
grant execute on function public.queue_customer_message(uuid, text, text) to service_role;
grant execute on function public.queue_order_customer_messages() to service_role;
grant execute on function public.queue_hold_customer_message() to service_role;
grant execute on function public.claim_customer_messages(integer) to service_role;
grant execute on function public.complete_customer_message(uuid, text, text) to service_role;

commit;
