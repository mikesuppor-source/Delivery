-- 025_dispatch_pro.sql
-- Phase 4: Dispatch Pro
-- Pickups, Route Ordering, Delivery Attempts, Return-to-shop Handover, and Hub Intake

begin;

-- ─── 1. Pickup Status Enum & Pickups Table ──────────────────────────────────
do $$ begin
  if not exists (select 1 from pg_type where typname = 'pickup_status') then
    create type public.pickup_status as enum ('requested', 'assigned', 'collected', 'cancelled');
  end if;
end $$;

create table if not exists public.pickups (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspaces(id) on delete cascade,
  shop_id          uuid not null references public.shops(id) on delete cascade,
  driver_id        uuid references public.drivers(id) on delete set null,
  status           public.pickup_status not null default 'requested',
  requested_at     timestamptz not null default now(),
  collected_at     timestamptz,
  parcel_count     integer not null default 1 check (parcel_count >= 1),
  note             text,
  proof_photo_path text,
  created_at       timestamptz not null default now(),
  unique (id, workspace_id)
);

create index if not exists idx_pickups_workspace_status on public.pickups (workspace_id, status);
create index if not exists idx_pickups_shop on public.pickups (shop_id);
create index if not exists idx_pickups_driver on public.pickups (driver_id);

-- ─── 2. Pickup Orders Junction Table ────────────────────────────────────────
create table if not exists public.pickup_orders (
  pickup_id    uuid not null references public.pickups(id) on delete cascade,
  order_id     uuid not null references public.orders(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (pickup_id, order_id)
);

create index if not exists idx_pickup_orders_pickup on public.pickup_orders (pickup_id);
create index if not exists idx_pickup_orders_order on public.pickup_orders (order_id);

-- ─── 3. Orders Table Additions for Phase 4 ──────────────────────────────────
alter table public.orders
  add column if not exists received_at_hub timestamptz,
  add column if not exists route_position integer,
  add column if not exists returns_handed_at timestamptz,
  add column if not exists returns_signature_path text;

create index if not exists idx_orders_route_position on public.orders (driver_id, route_position) where status in ('assigned', 'picked_up');
create index if not exists idx_orders_returns_handed on public.orders (shop_id, returns_handed_at) where status = 'returned';

-- ─── 4. Workspace Max Attempts & Max Load Settings ──────────────────────────
alter table public.workspaces
  add column if not exists max_delivery_attempts integer not null default 3 check (max_delivery_attempts >= 1),
  add column if not exists max_driver_load integer not null default 50 check (max_driver_load >= 1);

-- ─── 5. Delivery Attempt Result Enum & Delivery Attempts Table ──────────────
do $$ begin
  if not exists (select 1 from pg_type where typname = 'attempt_result') then
    create type public.attempt_result as enum (
      'delivered',
      'no_answer',
      'refused',
      'wrong_address',
      'rescheduled',
      'closed',
      'other'
    );
  end if;
end $$;

create table if not exists public.delivery_attempts (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  order_id        uuid not null references public.orders(id) on delete cascade,
  driver_id       uuid references public.drivers(id) on delete set null,
  attempt_no      integer not null check (attempt_no >= 1),
  result          public.attempt_result not null,
  note            text,
  photo_path      text,
  lat             double precision,
  lng             double precision,
  rescheduled_for date,
  created_at      timestamptz not null default now()
);

create index if not exists idx_delivery_attempts_order on public.delivery_attempts (order_id, attempt_no);
create index if not exists idx_delivery_attempts_workspace on public.delivery_attempts (workspace_id);

-- ─── 6. Stored Functions ────────────────────────────────────────────────────

-- Record Delivery Attempt
create or replace function public.record_delivery_attempt(
  p_order_id uuid,
  p_driver_id uuid,
  p_result public.attempt_result,
  p_note text default null,
  p_photo_path text default null,
  p_lat double precision default null,
  p_lng double precision default null,
  p_rescheduled_for date default null
) returns jsonb
language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare
  v_order public.orders%rowtype;
  v_max_attempts integer;
  v_attempt_no integer;
  v_new_status public.order_status;
  v_attempt_id uuid;
begin
  select * into v_order from public.orders where id = p_order_id;
  if not found then
    raise exception 'Order % not found', p_order_id;
  end if;

  select coalesce(max_delivery_attempts, 3) into v_max_attempts
  from public.workspaces where id = v_order.workspace_id;

  select coalesce(max(attempt_no), 0) + 1 into v_attempt_no
  from public.delivery_attempts where order_id = p_order_id;

  insert into public.delivery_attempts (
    workspace_id,
    order_id,
    driver_id,
    attempt_no,
    result,
    note,
    photo_path,
    lat,
    lng,
    rescheduled_for
  ) values (
    v_order.workspace_id,
    p_order_id,
    p_driver_id,
    v_attempt_no,
    p_result,
    p_note,
    p_photo_path,
    p_lat,
    p_lng,
    p_rescheduled_for
  ) returning id into v_attempt_id;

  if p_result = 'delivered' then
    v_new_status := 'delivered';
    update public.orders
    set status = 'delivered',
        delivered_at = coalesce(delivered_at, now()),
        driver_id = coalesce(p_driver_id, driver_id),
        updated_at = now()
    where id = p_order_id;
  elsif p_result = 'refused' or v_attempt_no >= v_max_attempts then
    v_new_status := 'returned';
    update public.orders
    set status = 'returned',
        driver_id = coalesce(p_driver_id, driver_id),
        updated_at = now()
    where id = p_order_id;
  else
    v_new_status := 'failed';
    update public.orders
    set status = 'failed',
        driver_id = coalesce(p_driver_id, driver_id),
        updated_at = now()
    where id = p_order_id;

    -- If customer rescheduled for a future date, put on warehouse hold if a hub exists
    if p_result = 'rescheduled' and p_rescheduled_for is not null then
      declare
        v_hub_id uuid;
      begin
        select id into v_hub_id from public.hubs where workspace_id = v_order.workspace_id and is_default = true limit 1;
        if v_hub_id is null then
          select id into v_hub_id from public.hubs where workspace_id = v_order.workspace_id limit 1;
        end if;
        if v_hub_id is not null and not exists (select 1 from public.order_holds where order_id = p_order_id and released_at is null) then
          -- Unassign driver and set is_held to true in compliance with guard_order_change
          update public.orders
          set is_held = true,
              hub_id = v_hub_id,
              driver_id = null,
              status = 'pending',
              updated_at = now()
          where id = p_order_id;

          v_new_status := 'pending';

          insert into public.order_holds (
            workspace_id, order_id, hub_id, reason, note, deliver_after, held_at
          ) values (
            v_order.workspace_id, p_order_id, v_hub_id, 'customer_request', coalesce(p_note, 'Rescheduled by customer'), p_rescheduled_for, now()
          );
        end if;
      end;
    end if;
  end if;

  insert into public.order_events (workspace_id, order_id, old_status, new_status, created_at)
  values (v_order.workspace_id, p_order_id, v_order.status, v_new_status, now());

  return jsonb_build_object(
    'success', true,
    'attempt_id', v_attempt_id,
    'attempt_no', v_attempt_no,
    'result', p_result,
    'new_status', v_new_status,
    'max_attempts', v_max_attempts
  );
end;
$$;

-- Collect Pickup
create or replace function public.collect_pickup(
  p_pickup_id uuid,
  p_driver_id uuid,
  p_proof_photo_path text default null,
  p_order_ids uuid[] default null
) returns jsonb
language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare
  v_pickup public.pickups%rowtype;
  v_oid uuid;
  v_count integer := 0;
begin
  select * into v_pickup from public.pickups where id = p_pickup_id;
  if not found then
    raise exception 'Pickup % not found', p_pickup_id;
  end if;

  update public.pickups
  set status = 'collected',
      collected_at = now(),
      driver_id = coalesce(p_driver_id, driver_id),
      proof_photo_path = coalesce(p_proof_photo_path, proof_photo_path)
  where id = p_pickup_id;

  if p_order_ids is not null and array_length(p_order_ids, 1) > 0 then
    foreach v_oid in array p_order_ids loop
      insert into public.pickup_orders (pickup_id, order_id, workspace_id)
      values (p_pickup_id, v_oid, v_pickup.workspace_id)
      on conflict (pickup_id, order_id) do nothing;

      update public.orders
      set status = 'picked_up',
          driver_id = coalesce(p_driver_id, driver_id),
          updated_at = now()
      where id = v_oid and workspace_id = v_pickup.workspace_id;

      v_count := v_count + 1;
    end loop;
  end if;

  return jsonb_build_object(
    'success', true,
    'pickup_id', p_pickup_id,
    'orders_collected', v_count
  );
end;
$$;

-- Handover Returns
create or replace function public.handover_returns(
  p_shop_id uuid,
  p_order_ids uuid[],
  p_signature_path text default null
) returns jsonb
language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare
  v_updated_count integer := 0;
begin
  if p_order_ids is null or array_length(p_order_ids, 1) = 0 then
    return jsonb_build_object('success', true, 'count', 0);
  end if;

  update public.orders
  set returns_handed_at = now(),
      returns_signature_path = coalesce(p_signature_path, returns_signature_path),
      updated_at = now()
  where id = any(p_order_ids)
    and shop_id = p_shop_id
    and status = 'returned';

  get diagnostics v_updated_count = row_count;

  return jsonb_build_object(
    'success', true,
    'count', v_updated_count,
    'shop_id', p_shop_id
  );
end;
$$;

-- Set Route Positions
create or replace function public.set_route_positions(
  p_driver_id uuid,
  p_positions jsonb
) returns jsonb
language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare
  v_item jsonb;
  v_order_id uuid;
  v_position integer;
  v_count integer := 0;
begin
  if jsonb_typeof(p_positions) <> 'array' then
    raise exception 'Positions must be a jsonb array of {order_id, position}';
  end if;

  for v_item in select * from jsonb_array_elements(p_positions) loop
    v_order_id := (v_item->>'order_id')::uuid;
    v_position := (v_item->>'position')::integer;

    update public.orders
    set route_position = v_position,
        updated_at = now()
    where id = v_order_id
      and driver_id = p_driver_id;

    v_count := v_count + 1;
  end loop;

  return jsonb_build_object('success', true, 'updated', v_count);
end;
$$;

-- Mark Received at Hub
create or replace function public.mark_received_at_hub(
  p_order_id uuid
) returns jsonb
language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
begin
  update public.orders
  set received_at_hub = coalesce(received_at_hub, now()),
      updated_at = now()
  where id = p_order_id;

  return jsonb_build_object('success', true, 'order_id', p_order_id);
end;
$$;

-- ─── 7. Row Level Security & Grants ─────────────────────────────────────────

alter table public.pickups enable row level security;
alter table public.pickup_orders enable row level security;
alter table public.delivery_attempts enable row level security;

-- Pickups RLS
revoke all on public.pickups from anon;
grant select, insert, update on public.pickups to authenticated;
grant all on public.pickups to service_role;

drop policy if exists "staff reads pickups" on public.pickups;
create policy "staff reads pickups" on public.pickups for select to authenticated
  using (public.my_role(workspace_id) in ('owner', 'manager', 'driver', 'readonly'));

drop policy if exists "staff manages pickups" on public.pickups;
create policy "staff manages pickups" on public.pickups for all to authenticated
  using (public.my_role(workspace_id) in ('owner', 'manager'))
  with check (public.my_role(workspace_id) in ('owner', 'manager'));

drop policy if exists "merchant reads own pickups" on public.pickups;
create policy "merchant reads own pickups" on public.pickups for select to authenticated
  using (
    exists (
      select 1 from public.shops s
      where s.id = pickups.shop_id
        and s.user_id = (select auth.uid())
    )
  );

drop policy if exists "merchant requests pickups" on public.pickups;
create policy "merchant requests pickups" on public.pickups for insert to authenticated
  with check (
    exists (
      select 1 from public.shops s
      where s.id = pickups.shop_id
        and s.user_id = (select auth.uid())
    )
  );

drop policy if exists "driver reads assigned pickups" on public.pickups;
create policy "driver reads assigned pickups" on public.pickups for select to authenticated
  using (
    driver_id in (select id from public.drivers where user_id = (select auth.uid()))
  );

-- Pickup Orders RLS
revoke all on public.pickup_orders from anon;
grant select, insert, update, delete on public.pickup_orders to authenticated;
grant all on public.pickup_orders to service_role;

drop policy if exists "staff reads pickup orders" on public.pickup_orders;
create policy "staff reads pickup orders" on public.pickup_orders for select to authenticated
  using (public.my_role(workspace_id) in ('owner', 'manager', 'driver', 'readonly'));

drop policy if exists "staff manages pickup orders" on public.pickup_orders;
create policy "staff manages pickup orders" on public.pickup_orders for all to authenticated
  using (public.my_role(workspace_id) in ('owner', 'manager'))
  with check (public.my_role(workspace_id) in ('owner', 'manager'));

drop policy if exists "merchant reads own pickup orders" on public.pickup_orders;
create policy "merchant reads own pickup orders" on public.pickup_orders for select to authenticated
  using (
    exists (
      select 1 from public.pickups p
      join public.shops s on s.id = p.shop_id
      where p.id = pickup_orders.pickup_id
        and s.user_id = (select auth.uid())
    )
  );

-- Delivery Attempts RLS
revoke all on public.delivery_attempts from anon;
grant select, insert on public.delivery_attempts to authenticated;
grant all on public.delivery_attempts to service_role;

drop policy if exists "staff reads delivery attempts" on public.delivery_attempts;
create policy "staff reads delivery attempts" on public.delivery_attempts for select to authenticated
  using (public.my_role(workspace_id) in ('owner', 'manager', 'driver', 'readonly'));

drop policy if exists "staff and drivers insert delivery attempts" on public.delivery_attempts;
create policy "staff and drivers insert delivery attempts" on public.delivery_attempts for insert to authenticated
  with check (
    public.my_role(workspace_id) in ('owner', 'manager')
    or driver_id in (select id from public.drivers where user_id = (select auth.uid()))
  );

drop policy if exists "merchant reads own order delivery attempts" on public.delivery_attempts;
create policy "merchant reads own order delivery attempts" on public.delivery_attempts for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      join public.shops s on s.id = o.shop_id
      where o.id = delivery_attempts.order_id
        and s.user_id = (select auth.uid())
    )
  );

-- Grants on stored functions
grant execute on function public.record_delivery_attempt(uuid, uuid, public.attempt_result, text, text, double precision, double precision, date) to authenticated, service_role;
grant execute on function public.collect_pickup(uuid, uuid, text, uuid[]) to authenticated, service_role;
grant execute on function public.handover_returns(uuid, uuid[], text) to authenticated, service_role;
grant execute on function public.set_route_positions(uuid, jsonb) to authenticated, service_role;
grant execute on function public.mark_received_at_hub(uuid) to authenticated, service_role;

commit;
