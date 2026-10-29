-- 024_warehouse.sql
-- Phase 3: Warehouse holding & consolidation workflow
-- Hubs, Shelves, Hold reasons, Order holds, Storage fees, and atomic hold/release functions.

begin;

-- ─── 1. Hubs table ──────────────────────────────────────────────────────────
create table if not exists public.hubs (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name         text not null,
  address      text,
  lat          numeric(10, 7),
  lng          numeric(10, 7),
  is_default   boolean not null default false,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  unique (id, workspace_id)
);
create index if not exists hubs_workspace_idx on public.hubs(workspace_id);

-- ─── 2. Hub Shelves table ───────────────────────────────────────────────────
create table if not exists public.hub_shelves (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  hub_id       uuid not null,
  code         text not null,
  zone_id      uuid references public.delivery_areas(id) on delete set null,
  created_at   timestamptz not null default now(),
  foreign key (hub_id, workspace_id) references public.hubs(id, workspace_id) on delete cascade,
  unique (hub_id, code)
);
create index if not exists hub_shelves_hub_idx on public.hub_shelves(hub_id);

-- ─── 3. Hold Reason Enum ────────────────────────────────────────────────────
do $$ begin
  create type public.hold_reason as enum (
    'weather',
    'far_zone',
    'customer_request',
    'scheduled',
    'address_problem',
    'shop_request',
    'other'
  );
exception when duplicate_object then null; end $$;

-- ─── 4. Order Holds table ───────────────────────────────────────────────────
create table if not exists public.order_holds (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  order_id      uuid not null references public.orders(id) on delete cascade,
  hub_id        uuid not null references public.hubs(id) on delete cascade,
  shelf_code    text,
  reason        public.hold_reason not null,
  note          text,
  deliver_after date,
  held_at       timestamptz not null default now(),
  held_by       uuid references auth.users(id) on delete set null,
  released_at   timestamptz,
  released_by   uuid references auth.users(id) on delete set null,
  release_note  text,
  foreign key (hub_id, workspace_id) references public.hubs(id, workspace_id) on delete cascade
);

create unique index if not exists order_holds_active_idx on public.order_holds(order_id) where released_at is null;
create index if not exists order_holds_workspace_hub_idx on public.order_holds(workspace_id, hub_id);
create index if not exists order_holds_deliver_after_idx on public.order_holds(deliver_after) where released_at is null;

-- ─── 5. Extend Orders & Delivery Areas ──────────────────────────────────────
alter table public.orders
  add column if not exists is_held boolean not null default false,
  add column if not exists hub_id uuid references public.hubs(id) on delete set null,
  add column if not exists storage_fee_usd numeric(10,2) not null default 0;

alter table public.delivery_areas
  add column if not exists storage_fee_per_day_usd numeric(10,2) not null default 0,
  add column if not exists free_storage_days int not null default 3;

do $$ begin
  alter table public.delivery_areas add constraint storage_prices_valid check (
    storage_fee_per_day_usd >= 0 and free_storage_days >= 0
  );
exception when duplicate_object then null; end $$;

-- ─── 6. Update order trigger for shop_balance_usd accounting ────────────────
create or replace function public.set_order_defaults()
returns trigger language plpgsql
set search_path = public, pg_temp as $$
declare
  candidate_code text;
  code_exists boolean;
begin
  if new.code is null or trim(new.code) = '' then
    loop
      candidate_code := 'CD-' || upper(substr(encode(gen_random_bytes(5), 'hex'), 1, 8));
      select exists(
        select 1 from public.orders where lower(code) = lower(candidate_code)
      ) into code_exists;

      if not code_exists then
        new.code := candidate_code;
        exit;
      end if;
    end loop;
  else
    new.code := upper(trim(new.code));
  end if;

  new.shop_balance_usd := new.collection_usd - new.delivery_fee_usd - coalesce(new.storage_fee_usd, 0);
  new.updated_at := now();
  return new;
end;
$$;

-- Guard order change to prevent assigning or delivering held orders and preserve owner deletion
create or replace function public.guard_order_change() returns trigger language plpgsql
set search_path=public,pg_temp as $$
begin
  if tg_op='DELETE' then
    if current_setting('app.allow_owner_delete', true) = 'true' then
      return old;
    end if;
    raise exception 'Archive or cancel orders; permanent deletion is disabled';
  end if;
  if tg_op='UPDATE' then
    if new.workspace_id<>old.workspace_id or new.shop_id is distinct from old.shop_id or new.usd_to_lbp_rate<>old.usd_to_lbp_rate then
      raise exception 'Order workspace, shop, and exchange rate are immutable';
    end if;
    if old.status='cancelled' and new.status<>'cancelled' then raise exception 'Cancelled orders cannot be reopened'; end if;
    if new.status='cancelled' and old.status<>'pending' and old.status<>'cancelled' then raise exception 'Only pending orders can be cancelled'; end if;
    
    -- Enforce that a held order cannot be assigned or dispatched until released
    if new.is_held and (new.driver_id is not null or new.status in ('assigned', 'picked_up', 'delivered')) then
      raise exception 'Cannot assign or dispatch a held order until it is released';
    end if;
  end if;

  if new.status='cancelled' then new.collection_usd:=0; new.delivery_fee_usd:=0; new.driver_pay_usd:=0; new.shop_balance_usd:=0; end if;
  if new.pod_collected_usd is not null then new.accounting_version:=2; end if;
  if new.status='delivered' then
    if tg_op='INSERT' or old.status<>'delivered' then new.delivered_at:=now(); end if;
    new.cash_discrepancy_usd:=round(coalesce(new.pod_collected_usd,new.collection_usd)+coalesce(new.pod_collected_lbp,0)/new.usd_to_lbp_rate-new.collection_usd,2);
  else
    new.delivered_at:=null;
  end if;

  return new;
end $$;

-- ─── 7. Stored Functions: hold_order & release_order ────────────────────────

create or replace function public.hold_order(
  p_order uuid,
  p_hub uuid,
  p_shelf text,
  p_reason public.hold_reason,
  p_note text default null,
  p_deliver_after date default null,
  p_user uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp as $$
declare
  v_workspace_id uuid;
  v_status public.order_status;
  v_driver_id uuid;
  v_role public.user_role;
  v_actor_user uuid;
  v_hold_id uuid;
begin
  select workspace_id, status, driver_id into v_workspace_id, v_status, v_driver_id
  from public.orders
  where id = p_order
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  v_actor_user := coalesce(p_user, auth.uid());

  -- Permission verification
  if v_actor_user is not null then
    select role into v_role from public.workspace_members where workspace_id = v_workspace_id and user_id = v_actor_user;
  else
    v_role := public.my_role(v_workspace_id);
  end if;

  if v_role is not null and v_role not in ('owner', 'manager') then
    raise exception 'Only owners and managers can hold orders in warehouse';
  end if;

  -- Hub verification
  if not exists (select 1 from public.hubs where id = p_hub and workspace_id = v_workspace_id and active = true) then
    raise exception 'Invalid hub for this workspace';
  end if;

  -- Valid order status verification
  if v_status not in ('pending', 'assigned', 'failed') then
    raise exception 'Can only hold orders in pending, assigned, or failed status';
  end if;

  -- Prevent duplicate open hold
  if exists (select 1 from public.order_holds where order_id = p_order and released_at is null) then
    raise exception 'Order is already on hold in warehouse';
  end if;

  -- If order was assigned, unassign driver and move back to pending
  if v_status = 'assigned' then
    update public.orders
    set driver_id = null,
        status = 'pending',
        is_held = true,
        hub_id = p_hub,
        updated_at = now()
    where id = p_order;

    insert into public.order_events (workspace_id, order_id, old_status, new_status, created_at)
    values (v_workspace_id, p_order, 'assigned', 'pending', now());
  else
    update public.orders
    set is_held = true,
        hub_id = p_hub,
        updated_at = now()
    where id = p_order;
  end if;

  -- Create hold record
  insert into public.order_holds (
    workspace_id,
    order_id,
    hub_id,
    shelf_code,
    reason,
    note,
    deliver_after,
    held_at,
    held_by
  ) values (
    v_workspace_id,
    p_order,
    p_hub,
    p_shelf,
    p_reason,
    p_note,
    p_deliver_after,
    now(),
    v_actor_user
  ) returning id into v_hold_id;

  -- Write audit log
  insert into public.audit_log (
    workspace_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    diff
  ) values (
    v_workspace_id,
    v_actor_user,
    'order_held',
    'order',
    p_order,
    jsonb_build_object(
      'hub_id', p_hub,
      'shelf_code', p_shelf,
      'reason', p_reason,
      'deliver_after', p_deliver_after,
      'previous_status', v_status
    )
  );

  return jsonb_build_object(
    'success', true,
    'hold_id', v_hold_id,
    'order_id', p_order,
    'is_held', true
  );
end;
$$;

create or replace function public.release_order(
  p_order uuid,
  p_user uuid default null,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp as $$
declare
  v_workspace_id uuid;
  v_area_id uuid;
  v_actor_user uuid;
  v_role public.user_role;
  v_hold_id uuid;
  v_held_at timestamptz;
  v_days_held integer;
  v_free_days integer;
  v_fee_per_day numeric(10,2);
  v_billable_days integer;
  v_calc_fee numeric(10,2) := 0;
begin
  select workspace_id, area_id into v_workspace_id, v_area_id
  from public.orders
  where id = p_order
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  v_actor_user := coalesce(p_user, auth.uid());

  if v_actor_user is not null then
    select role into v_role from public.workspace_members where workspace_id = v_workspace_id and user_id = v_actor_user;
  else
    v_role := public.my_role(v_workspace_id);
  end if;

  if v_role is not null and v_role not in ('owner', 'manager') then
    raise exception 'Only owners and managers can release orders from warehouse';
  end if;

  select id, held_at into v_hold_id, v_held_at
  from public.order_holds
  where order_id = p_order and released_at is null
  for update;

  if not found then
    raise exception 'No active warehouse hold found for this order';
  end if;

  -- Calculate storage duration and fee (full elapsed days)
  v_days_held := greatest(0, floor(extract(epoch from (now() - v_held_at)) / 86400.0)::integer);

  if v_area_id is not null then
    select coalesce(storage_fee_per_day_usd, 0), coalesce(free_storage_days, 3)
    into v_fee_per_day, v_free_days
    from public.delivery_areas
    where id = v_area_id;
  end if;

  v_fee_per_day := coalesce(v_fee_per_day, 0);
  v_free_days := coalesce(v_free_days, 3);
  v_billable_days := greatest(0, v_days_held - v_free_days);
  v_calc_fee := round((v_billable_days * v_fee_per_day)::numeric, 2);

  -- Close hold record
  update public.order_holds
  set released_at = now(),
      released_by = v_actor_user,
      release_note = p_note
  where id = v_hold_id;

  -- Release order
  update public.orders
  set is_held = false,
      storage_fee_usd = coalesce(storage_fee_usd, 0) + v_calc_fee,
      updated_at = now()
  where id = p_order;

  -- Write audit log
  insert into public.audit_log (
    workspace_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    diff
  ) values (
    v_workspace_id,
    v_actor_user,
    'order_released',
    'order',
    p_order,
    jsonb_build_object(
      'hold_id', v_hold_id,
      'days_held', v_days_held,
      'storage_fee_usd', v_calc_fee,
      'release_note', p_note
    )
  );

  return jsonb_build_object(
    'success', true,
    'hold_id', v_hold_id,
    'order_id', p_order,
    'days_held', v_days_held,
    'storage_fee_usd', v_calc_fee
  );
end;
$$;

-- ─── 8. Row Level Security & Grants ─────────────────────────────────────────

alter table public.hubs enable row level security;
alter table public.hub_shelves enable row level security;
alter table public.order_holds enable row level security;

-- Hubs
revoke all on public.hubs from anon;
grant select on public.hubs to authenticated;
grant all on public.hubs to service_role;

drop policy if exists "staff reads hubs" on public.hubs;
create policy "staff reads hubs" on public.hubs for select to authenticated
  using (public.my_role(workspace_id) in ('owner', 'manager', 'driver', 'readonly'));

drop policy if exists "managers write hubs" on public.hubs;
create policy "managers write hubs" on public.hubs for all to authenticated
  using (public.my_role(workspace_id) in ('owner', 'manager'))
  with check (public.my_role(workspace_id) in ('owner', 'manager'));

-- Hub Shelves
revoke all on public.hub_shelves from anon;
grant select on public.hub_shelves to authenticated;
grant all on public.hub_shelves to service_role;

drop policy if exists "staff reads hub shelves" on public.hub_shelves;
create policy "staff reads hub shelves" on public.hub_shelves for select to authenticated
  using (public.my_role(workspace_id) in ('owner', 'manager', 'driver', 'readonly'));

drop policy if exists "managers write hub shelves" on public.hub_shelves;
create policy "managers write hub shelves" on public.hub_shelves for all to authenticated
  using (public.my_role(workspace_id) in ('owner', 'manager'))
  with check (public.my_role(workspace_id) in ('owner', 'manager'));

-- Order Holds
revoke all on public.order_holds from anon, authenticated;
grant select on public.order_holds to authenticated;
grant all on public.order_holds to service_role;

drop policy if exists "staff reads order holds" on public.order_holds;
create policy "staff reads order holds" on public.order_holds for select to authenticated
  using (public.my_role(workspace_id) in ('owner', 'manager', 'driver', 'readonly'));

drop policy if exists "merchants read own order holds" on public.order_holds;
create policy "merchants read own order holds" on public.order_holds for select to authenticated
  using (
    exists (
      select 1 from public.shops s
      join public.orders o on o.shop_id = s.id
      where o.id = order_holds.order_id
        and s.user_id = (select auth.uid())
    )
  );

grant execute on function public.hold_order(uuid, uuid, text, public.hold_reason, text, date, uuid) to authenticated, service_role;
grant execute on function public.release_order(uuid, uuid, text) to authenticated, service_role;

commit;
