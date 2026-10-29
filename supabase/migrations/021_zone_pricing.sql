-- 021_zone_pricing.sql
-- Pricing per delivery zone: courier pay, return fee and return courier pay, plus
-- optional special prices per shop. Existing orders keep the prices stored on them.

begin;

-- ─── 1. Zone prices ───
-- driver_pay_usd stays empty for existing zones, which then use the workspace default.
alter table public.delivery_areas
  add column if not exists driver_pay_usd numeric(10,2),
  add column if not exists return_fee_usd numeric(10,2) not null default 2,
  add column if not exists return_driver_pay_usd numeric(10,2) not null default 1;

do $$ begin
  alter table public.delivery_areas add constraint area_prices_valid check (
    (driver_pay_usd is null or driver_pay_usd >= 0) and return_fee_usd >= 0 and return_driver_pay_usd >= 0
  );
exception when duplicate_object then null; end $$;

-- ─── 2. Special prices per shop and zone ───
create table if not exists public.shop_area_prices (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  shop_id      uuid not null,
  area_id      uuid not null,
  fee_usd      numeric(10,2) not null check (fee_usd >= 0),
  updated_at   timestamptz not null default now(),
  primary key (shop_id, area_id),
  -- Shop and zone must belong to the same company as the price
  foreign key (shop_id, workspace_id) references public.shops(id, workspace_id) on delete cascade,
  foreign key (area_id, workspace_id) references public.delivery_areas(id, workspace_id) on delete cascade
);
create index if not exists shop_area_prices_workspace on public.shop_area_prices(workspace_id);

alter table public.shop_area_prices enable row level security;
-- Changes go through server routes; app users may only read
revoke insert, update, delete on public.shop_area_prices from anon, authenticated;

drop policy if exists "staff or shop owner reads shop prices" on public.shop_area_prices;
create policy "staff or shop owner reads shop prices" on public.shop_area_prices for select to authenticated
  using (
    public.my_role(workspace_id) in ('owner', 'manager', 'readonly')
    or exists (select 1 from public.shops s where s.id = shop_area_prices.shop_id and s.user_id = (select auth.uid()))
  );

commit;
