-- 026_customer_experience.sql
-- Phase 5: Customer Experience, Public Order Intake, Live Tracking, Ratings & Messaging

begin;

-- ─── 1. Message Log Table ───────────────────────────────────────────────────
create table if not exists public.message_log (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  order_id     uuid references public.orders(id) on delete cascade,
  channel      text not null check (channel in ('whatsapp', 'sms', 'system')),
  template     text not null,
  to_phone     text not null,
  body         text,
  status       text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  error        text,
  created_at   timestamptz not null default now(),
  sent_at      timestamptz
);

create index if not exists idx_message_log_workspace on public.message_log (workspace_id, status);
create index if not exists idx_message_log_order on public.message_log (order_id);

-- ─── 2. Workspace Notification Settings & WhatsApp Cloud Columns ────────────
alter table public.workspaces
  add column if not exists notify_order_created boolean not null default true,
  add column if not exists notify_out_for_delivery boolean not null default true,
  add column if not exists notify_delivered boolean not null default true,
  add column if not exists notify_failed_attempt boolean not null default true,
  add column if not exists notify_held boolean not null default true,
  add column if not exists whatsapp_cloud_token text default null,
  add column if not exists whatsapp_phone_number_id text default null,
  add column if not exists whatsapp_business_account_id text default null;

-- ─── 3. Delivery Areas & Orders Additions ───────────────────────────────────
alter table public.delivery_areas
  add column if not exists time_slots text[] default array['09:00 - 13:00', '13:00 - 17:00', '17:00 - 21:00']::text[];

alter table public.orders
  add column if not exists time_slot text default null,
  add column if not exists sender_name text default null,
  add column if not exists sender_phone text default null,
  add column if not exists sender_address text default null,
  add column if not exists declared_value_usd numeric(10,2) default null;

-- ─── 4. Walk-in Shop Support ────────────────────────────────────────────────
alter table public.shops
  add column if not exists is_walkin boolean not null default false;

create or replace function public.get_or_create_walkin_shop(p_workspace_id uuid)
returns uuid
language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare
  v_shop_id uuid;
begin
  select id into v_shop_id
  from public.shops
  where workspace_id = p_workspace_id and is_walkin = true
  limit 1;

  if v_shop_id is null then
    insert into public.shops (
      workspace_id,
      name,
      phone,
      address,
      is_walkin,
      active
    ) values (
      p_workspace_id,
      'Walk-in Retail Senders',
      '+961 1 000 000',
      'Cedar Dispatch Counter',
      true,
      true
    ) returning id into v_shop_id;
  end if;

  return v_shop_id;
end;
$$;

-- ─── 5. Order Ratings Table ─────────────────────────────────────────────────
create table if not exists public.order_ratings (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  order_id     uuid not null unique references public.orders(id) on delete cascade,
  driver_id    uuid references public.drivers(id) on delete set null,
  rating       integer not null check (rating >= 1 and rating <= 5),
  comment      text,
  created_at   timestamptz not null default now()
);

create index if not exists idx_order_ratings_workspace on public.order_ratings (workspace_id);
create index if not exists idx_order_ratings_driver on public.order_ratings (driver_id);
create index if not exists idx_order_ratings_order on public.order_ratings (order_id);

-- ─── 6. Stored Procedures ───────────────────────────────────────────────────

-- Submit Order Rating (Called by customer tracking page)
create or replace function public.submit_order_rating(
  p_tracking_token text,
  p_rating integer,
  p_comment text default null
) returns jsonb
language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare
  v_order public.orders%rowtype;
  v_rating_id uuid;
begin
  if p_rating < 1 or p_rating > 5 then
    raise exception 'Rating must be between 1 and 5';
  end if;

  select * into v_order from public.orders where tracking_token = p_tracking_token;
  if not found then
    raise exception 'Order with specified tracking token was not found';
  end if;

  if v_order.status != 'delivered' then
    raise exception 'Ratings can only be submitted for delivered orders';
  end if;

  if exists (select 1 from public.order_ratings where order_id = v_order.id) then
    raise exception 'This order has already been rated';
  end if;

  insert into public.order_ratings (
    workspace_id,
    order_id,
    driver_id,
    rating,
    comment
  ) values (
    v_order.workspace_id,
    v_order.id,
    v_order.driver_id,
    p_rating,
    trim(p_comment)
  ) returning id into v_rating_id;

  return jsonb_build_object(
    'rating_id', v_rating_id,
    'order_id', v_order.id,
    'driver_id', v_order.driver_id,
    'rating', p_rating,
    'submitted_at', now()
  );
end;
$$;

-- Driver Rating Summary
create or replace function public.get_driver_rating_summary(p_driver_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare
  v_avg numeric(3,2);
  v_count integer;
begin
  select coalesce(round(avg(rating)::numeric, 2), 0.0), count(*)
  into v_avg, v_count
  from public.order_ratings
  where driver_id = p_driver_id;

  return jsonb_build_object(
    'average', v_avg,
    'total_ratings', v_count
  );
end;
$$;

-- Log Customer Message
create or replace function public.log_customer_message(
  p_workspace_id uuid,
  p_order_id uuid,
  p_channel text,
  p_template text,
  p_to_phone text,
  p_body text,
  p_status text default 'pending',
  p_error text default null
) returns uuid
language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare
  v_log_id uuid;
begin
  insert into public.message_log (
    workspace_id,
    order_id,
    channel,
    template,
    to_phone,
    body,
    status,
    error,
    sent_at
  ) values (
    p_workspace_id,
    p_order_id,
    p_channel,
    p_template,
    p_to_phone,
    p_body,
    p_status,
    p_error,
    case when p_status = 'sent' then now() else null end
  ) returning id into v_log_id;
  return v_log_id;
end;
$$;

-- ─── 7. Row Level Security & Grants ─────────────────────────────────────────

alter table public.message_log enable row level security;
alter table public.order_ratings enable row level security;

-- message_log policies
drop policy if exists "staff reads message log" on public.message_log;
create policy "staff reads message log" on public.message_log
  for select to authenticated
  using (public.my_role(workspace_id) in ('owner', 'manager', 'readonly'));

-- order_ratings policies
drop policy if exists "staff reads order ratings" on public.order_ratings;
create policy "staff reads order ratings" on public.order_ratings
  for select to authenticated
  using (public.my_role(workspace_id) in ('owner', 'manager', 'readonly'));

-- driver reads own ratings
drop policy if exists "driver reads own ratings" on public.order_ratings;
create policy "driver reads own ratings" on public.order_ratings
  for select to authenticated
  using (
    exists (
      select 1 from public.drivers d
      where d.id = order_ratings.driver_id and d.user_id = auth.uid()
    )
  );

-- Grants
revoke all on public.message_log from anon;
grant select on public.message_log to authenticated;
grant all on public.message_log to service_role;

revoke all on public.order_ratings from anon;
grant select on public.order_ratings to authenticated;
grant all on public.order_ratings to service_role;

grant execute on function public.get_or_create_walkin_shop(uuid) to authenticated, service_role;
grant execute on function public.submit_order_rating(text, integer, text) to anon, authenticated, service_role;
grant execute on function public.get_driver_rating_summary(uuid) to anon, authenticated, service_role;
grant execute on function public.log_customer_message(uuid, uuid, text, text, text, text, text, text) to authenticated, service_role;

commit;
