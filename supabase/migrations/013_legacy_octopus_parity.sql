-- ============================================================
-- Cedar Delivery Desk — Database Schema
-- Migration 013: Legacy Octopus Logistics Parity
-- ============================================================

-- ─── 1. Order Service Types & Package Attributes ───────────
do $$ begin
  create type public.order_service_type as enum ('delivery', 'replacement', 'pickup');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.cashout_status as enum ('pending', 'approved', 'rejected', 'paid');
exception
  when duplicate_object then null;
end $$;

-- Add new columns to orders
alter table public.orders
  add column if not exists service_type public.order_service_type not null default 'delivery',
  add column if not exists weight_kg numeric(8,2) not null default 1.0,
  add column if not exists is_breakable boolean not null default false,
  add column if not exists payment_method text not null default 'cash_usd',
  add column if not exists carrier_name text,
  add column if not exists carrier_tracking_code text,
  add column if not exists destination_governorate text,
  add column if not exists destination_caza text,
  add column if not exists destination_town text;

create index if not exists idx_orders_carrier_code on public.orders(carrier_tracking_code);
create index if not exists idx_orders_service_type on public.orders(service_type);

-- ─── 2. Customer Phone CRM Directory ──────────────────────
create table if not exists public.customers (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  phone        text not null,
  name         text not null,
  governorate  text,
  caza         text,
  town         text,
  address      text,
  notes        text,
  orders_count integer not null default 0,
  last_order_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique(workspace_id, phone)
);

create index if not exists idx_customers_phone on public.customers(workspace_id, phone);
create index if not exists idx_customers_name on public.customers(workspace_id, name);

alter table public.customers enable row level security;

do $$ begin
  create policy "Workspace members can view customers"
    on public.customers for select
    using (
      exists (
        select 1 from public.workspace_members
        where workspace_members.workspace_id = customers.workspace_id
          and workspace_members.user_id = auth.uid()
      )
      or
      exists (
        select 1 from public.shops
        where shops.workspace_id = customers.workspace_id
          and shops.user_id = auth.uid()
      )
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Workspace members and shops can insert customers"
    on public.customers for insert
    with check (
      exists (
        select 1 from public.workspace_members
        where workspace_members.workspace_id = customers.workspace_id
          and workspace_members.user_id = auth.uid()
      )
      or
      exists (
        select 1 from public.shops
        where shops.workspace_id = customers.workspace_id
          and shops.user_id = auth.uid()
      )
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Workspace members and shops can update customers"
    on public.customers for update
    using (
      exists (
        select 1 from public.workspace_members
        where workspace_members.workspace_id = customers.workspace_id
          and workspace_members.user_id = auth.uid()
      )
      or
      exists (
        select 1 from public.shops
        where shops.workspace_id = customers.workspace_id
          and shops.user_id = auth.uid()
      )
    );
exception when duplicate_object then null; end $$;

-- Auto-sync customers from incoming orders trigger
create or replace function public.sync_order_customer()
returns trigger language plpgsql security definer as $_$
declare
  clean_phone text;
begin
  if new.recipient_phone is not null and trim(new.recipient_phone) <> '' then
    clean_phone := regexp_replace(trim(new.recipient_phone), '[^0-9+]', '', 'g');
    if length(clean_phone) >= 6 then
      insert into public.customers (
        workspace_id, phone, name, governorate, caza, town, address, orders_count, last_order_at, updated_at
      ) values (
        new.workspace_id,
        clean_phone,
        coalesce(nullif(trim(new.recipient_name), ''), 'Customer'),
        new.destination_governorate,
        new.destination_caza,
        new.destination_town,
        coalesce(nullif(trim(new.recipient_address), ''), ''),
        1,
        now(),
        now()
      )
      on conflict (workspace_id, phone) do update set
        name = coalesce(nullif(trim(excluded.name), 'Customer'), customers.name),
        governorate = coalesce(excluded.governorate, customers.governorate),
        caza = coalesce(excluded.caza, customers.caza),
        town = coalesce(excluded.town, customers.town),
        address = coalesce(nullif(excluded.address, ''), customers.address),
        orders_count = customers.orders_count + 1,
        last_order_at = now(),
        updated_at = now();
    end if;
  end if;
  return new;
end;
$_$;

drop trigger if exists order_customer_sync_trigger on public.orders;
create trigger order_customer_sync_trigger
  after insert on public.orders
  for each row execute function public.sync_order_customer();

-- Backfill existing customers from historical orders
insert into public.customers (workspace_id, phone, name, address, orders_count, last_order_at, created_at, updated_at)
select
  workspace_id,
  regexp_replace(trim(recipient_phone), '[^0-9+]', '', 'g') as phone,
  coalesce(nullif(trim(recipient_name), ''), 'Customer') as name,
  coalesce(nullif(trim(recipient_address), ''), '') as address,
  count(*) as orders_count,
  max(created_at) as last_order_at,
  min(created_at) as created_at,
  now() as updated_at
from public.orders
where recipient_phone is not null and length(regexp_replace(trim(recipient_phone), '[^0-9+]', '', 'g')) >= 6
group by workspace_id, regexp_replace(trim(recipient_phone), '[^0-9+]', '', 'g'), coalesce(nullif(trim(recipient_name), ''), 'Customer'), coalesce(nullif(trim(recipient_address), ''), '')
on conflict (workspace_id, phone) do nothing;

-- ─── 3. Merchant Cash-Out / Payout Requests ───────────────
create table if not exists public.cashout_requests (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  shop_id         uuid not null references public.shops(id) on delete cascade,
  amount_usd      numeric(10,2) not null default 0,
  amount_lbp      numeric(14,2) not null default 0,
  method          text not null default 'whish', -- 'whish', 'omt', 'cash_office', 'bank_transfer'
  account_details text not null,
  notes           text,
  status          public.cashout_status not null default 'pending',
  processed_by    uuid references auth.users(id),
  processed_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_cashout_shop on public.cashout_requests(shop_id);
create index if not exists idx_cashout_status on public.cashout_requests(workspace_id, status);

alter table public.cashout_requests enable row level security;

do $$ begin
  create policy "Workspace staff can view and manage cashout requests"
    on public.cashout_requests for all
    using (
      exists (
        select 1 from public.workspace_members
        where workspace_members.workspace_id = cashout_requests.workspace_id
          and workspace_members.user_id = auth.uid()
      )
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Shops can view their own cashout requests"
    on public.cashout_requests for select
    using (
      exists (
        select 1 from public.shops
        where shops.id = cashout_requests.shop_id
          and shops.user_id = auth.uid()
      )
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Shops can create cashout requests"
    on public.cashout_requests for insert
    with check (
      exists (
        select 1 from public.shops
        where shops.id = cashout_requests.shop_id
          and shops.user_id = auth.uid()
      )
    );
exception when duplicate_object then null; end $$;
