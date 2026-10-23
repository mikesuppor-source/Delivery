-- ============================================================
-- Cedar Delivery Desk — Database Schema
-- Migration 001: Core tables
-- ============================================================

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ─── Workspaces ────────────────────────────────────────────────────────────
create table public.workspaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  currency    text not null default 'USD',
  usd_to_lbp  numeric(12,2) not null default 90000,
  created_at  timestamptz not null default now()
);

-- ─── User Roles ────────────────────────────────────────────────────────────
create type public.user_role as enum ('owner', 'manager', 'driver', 'readonly');

-- ─── Workspace Members ─────────────────────────────────────────────────────
-- Maps Supabase auth.users to workspace roles
create table public.workspace_members (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  role          public.user_role not null default 'readonly',
  display_name  text,
  invited_by    uuid references auth.users(id),
  joined_at     timestamptz,
  created_at    timestamptz not null default now(),
  unique(workspace_id, user_id)
);

-- ─── Invitations ───────────────────────────────────────────────────────────
create table public.invitations (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  email         text not null,
  role          public.user_role not null default 'readonly',
  token         text not null unique default encode(gen_random_bytes(32), 'hex'),
  invited_by    uuid not null references auth.users(id),
  accepted_at   timestamptz,
  expires_at    timestamptz not null default (now() + interval '7 days'),
  created_at    timestamptz not null default now()
);

-- ─── Delivery Areas ────────────────────────────────────────────────────────
create table public.delivery_areas (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  name          text not null,
  fee_usd       numeric(10,2) not null default 0,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

-- ─── Shops ─────────────────────────────────────────────────────────────────
create table public.shops (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  name          text not null,
  phone         text,
  address       text,
  active        boolean not null default true,
  balance_usd   numeric(10,2) not null default 0,
  created_at    timestamptz not null default now()
);

-- ─── Drivers ───────────────────────────────────────────────────────────────
create table public.drivers (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  user_id       uuid references auth.users(id), -- nullable: driver may have no login
  name          text not null,
  phone         text,
  active        boolean not null default true,
  cash_held_usd numeric(10,2) not null default 0,
  pay_owed_usd  numeric(10,2) not null default 0,
  created_at    timestamptz not null default now()
);

-- ─── Order Status Enum ─────────────────────────────────────────────────────
create type public.order_status as enum (
  'pending', 'assigned', 'picked_up', 'delivered', 'failed', 'returned'
);

-- ─── Orders ────────────────────────────────────────────────────────────────
create table public.orders (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces(id) on delete cascade,
  code              text not null default '',
  shop_id           uuid references public.shops(id),
  driver_id         uuid references public.drivers(id),
  area_id           uuid references public.delivery_areas(id),
  status            public.order_status not null default 'pending',

  -- Financials locked at creation time
  usd_to_lbp_rate   numeric(12,2) not null,
  collection_usd    numeric(10,2) not null default 0,
  delivery_fee_usd  numeric(10,2) not null default 0,
  driver_pay_usd    numeric(10,2) not null default 0,
  shop_balance_usd  numeric(10,2) not null default 0,

  -- Recipient info
  notes             text,
  recipient_name    text,
  recipient_phone   text,
  recipient_address text,

  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  delivered_at timestamptz
);

-- Auto-generate order code + update timestamp
create or replace function public.set_order_defaults()
returns trigger language plpgsql as $$
begin
  if new.code = '' then
    new.code := 'CD-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 8));
  end if;
  new.shop_balance_usd := new.collection_usd - new.delivery_fee_usd;
  new.updated_at := now();
  return new;
end;
$$;

create trigger order_defaults_trigger
  before insert or update on public.orders
  for each row execute function public.set_order_defaults();

-- ─── Settlement Type Enum ──────────────────────────────────────────────────
create type public.settlement_type as enum (
  'shop_payment', 'driver_cash_remittance', 'driver_pay'
);

-- ─── Settlements ───────────────────────────────────────────────────────────
create table public.settlements (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  type          public.settlement_type not null,
  amount_usd    numeric(10,2) not null,
  usd_to_lbp    numeric(12,2) not null,
  shop_id       uuid references public.shops(id),
  driver_id     uuid references public.drivers(id),
  order_id      uuid references public.orders(id),
  note          text,
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now()
);

-- ─── Audit Log ─────────────────────────────────────────────────────────────
create table public.audit_log (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  actor_id      uuid references auth.users(id),
  actor_email   text,
  action        text not null,
  entity_type   text,
  entity_id     uuid,
  diff          jsonb,
  created_at    timestamptz not null default now()
);

-- ─── Indexes ───────────────────────────────────────────────────────────────
create index orders_workspace_status_idx on public.orders(workspace_id, status);
create index orders_driver_idx           on public.orders(driver_id);
create index orders_shop_idx             on public.orders(shop_id);
create index orders_created_idx          on public.orders(workspace_id, created_at desc);
create index audit_log_workspace_idx     on public.audit_log(workspace_id, created_at desc);
create index members_workspace_idx       on public.workspace_members(workspace_id);
create index members_user_idx            on public.workspace_members(user_id);
