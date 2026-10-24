-- ============================================================
-- Cedar Delivery Desk — Security & Performance Hardening
-- Migration 004: Function security, RLS subquery initplan,
-- and covering foreign key indexes
-- ============================================================

-- ─── 1. Fix Function Search Path Mutability & PostgREST RPC Exposure ──────────
-- Explicit search_path prevents schema-override attack vectors
create or replace function public.my_role(ws_id uuid)
returns public.user_role language sql security definer stable
set search_path = public, pg_temp as $$
  select role from public.workspace_members
  where workspace_id = ws_id and user_id = (select auth.uid());
$$;

revoke execute on function public.my_role(uuid) from public, anon;
grant execute on function public.my_role(uuid) to authenticated, service_role;

create or replace function public.is_member(ws_id uuid)
returns boolean language sql security definer stable
set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = ws_id and user_id = (select auth.uid())
  );
$$;

revoke execute on function public.is_member(uuid) from public, anon;
grant execute on function public.is_member(uuid) to authenticated, service_role;

-- Update trigger function with explicit search_path
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

  new.shop_balance_usd := new.collection_usd - new.delivery_fee_usd;
  new.updated_at := now();
  return new;
end;
$$;

-- ─── 2. Optimize RLS Policies (Eliminate InitPlan row-by-row re-evaluation) ───

-- Drivers: optimize auth call
drop policy if exists "role-based driver visibility" on public.drivers;
create policy "role-based driver visibility"
  on public.drivers for select
  using (
    public.is_member(workspace_id) and (
      public.my_role(workspace_id) in ('owner', 'manager', 'readonly')
      or user_id = (select auth.uid())
    )
  );

-- Orders: optimize auth call
drop policy if exists "role-based order visibility" on public.orders;
create policy "role-based order visibility"
  on public.orders for select
  using (
    public.is_member(workspace_id) and (
      public.my_role(workspace_id) in ('owner', 'manager', 'readonly')
      or driver_id in (
        select id from public.drivers where user_id = (select auth.uid())
      )
    )
  );

-- Fix multiple permissive policies on delivery_areas, shops, drivers
-- Separate management into INSERT, UPDATE, DELETE so SELECT only evaluates one policy
drop policy if exists "owner/manager manage areas" on public.delivery_areas;
create policy "owner/manager insert areas"
  on public.delivery_areas for insert
  with check (public.my_role(workspace_id) in ('owner', 'manager'));
create policy "owner/manager update areas"
  on public.delivery_areas for update
  using (public.my_role(workspace_id) in ('owner', 'manager'));
create policy "owner/manager delete areas"
  on public.delivery_areas for delete
  using (public.my_role(workspace_id) in ('owner', 'manager'));

drop policy if exists "owner/manager manage shops" on public.shops;
create policy "owner/manager insert shops"
  on public.shops for insert
  with check (public.my_role(workspace_id) in ('owner', 'manager'));
create policy "owner/manager update shops"
  on public.shops for update
  using (public.my_role(workspace_id) in ('owner', 'manager'));
create policy "owner/manager delete shops"
  on public.shops for delete
  using (public.my_role(workspace_id) in ('owner', 'manager'));

drop policy if exists "owner/manager manage drivers" on public.drivers;
create policy "owner/manager insert drivers"
  on public.drivers for insert
  with check (public.my_role(workspace_id) in ('owner', 'manager'));
create policy "owner/manager update drivers"
  on public.drivers for update
  using (public.my_role(workspace_id) in ('owner', 'manager'));
create policy "owner/manager delete drivers"
  on public.drivers for delete
  using (public.my_role(workspace_id) in ('owner', 'manager'));

-- ─── 3. Add Covering Indexes for Foreign Keys ─────────────────────────────────
create index if not exists orders_area_id_idx on public.orders(area_id);
create index if not exists orders_created_by_idx on public.orders(created_by);
create index if not exists settlements_shop_id_idx on public.settlements(shop_id);
create index if not exists settlements_driver_id_idx on public.settlements(driver_id);
create index if not exists settlements_order_id_idx on public.settlements(order_id);
create index if not exists settlements_workspace_id_idx on public.settlements(workspace_id);
create index if not exists settlements_created_by_idx on public.settlements(created_by);
create index if not exists shops_workspace_id_idx on public.shops(workspace_id);
create index if not exists shops_user_id_idx on public.shops(user_id);
create index if not exists drivers_workspace_id_idx on public.drivers(workspace_id);
create index if not exists drivers_user_id_idx on public.drivers(user_id);
create index if not exists delivery_areas_workspace_id_idx on public.delivery_areas(workspace_id);
create index if not exists invitations_workspace_id_idx on public.invitations(workspace_id);
create index if not exists invitations_invited_by_idx on public.invitations(invited_by);
create index if not exists workspace_members_invited_by_idx on public.workspace_members(invited_by);
create index if not exists audit_log_actor_id_idx on public.audit_log(actor_id);
