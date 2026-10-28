-- pgcrypto (gen_random_bytes, crypt) lives in "extensions" on Supabase; the CLI does not search it by default
set search_path = public, extensions;

begin;

-- Fail on conflicting integration identities; never silently delete historical orders.
create unique index shops_id_workspace_unique on public.shops(id, workspace_id);
create unique index drivers_id_workspace_unique on public.drivers(id, workspace_id);
create unique index areas_id_workspace_unique on public.delivery_areas(id, workspace_id);
create unique index shopify_external_order_unique on public.orders(shop_id, shopify_order_id) where shopify_order_id is not null;
create unique index shopify_domain_unique on public.shops(lower(shopify_domain)) where shopify_domain is not null;
create unique index shop_owner_unique on public.shops(user_id) where user_id is not null;

create table public.shop_integrations (
 shop_id uuid primary key references public.shops(id) on delete cascade,
 api_key text unique not null default encode(gen_random_bytes(32), 'hex'),
 access_token text,
 updated_at timestamptz not null default now()
);
insert into public.shop_integrations(shop_id, api_key, access_token)
 select id, coalesce(api_key, encode(gen_random_bytes(32),'hex')), shopify_access_token from public.shops;
alter table public.shops drop column api_key, drop column shopify_access_token;
alter table public.shop_integrations enable row level security;
revoke all on public.shop_integrations from public, anon, authenticated;
grant all on public.shop_integrations to service_role;

create table public.oauth_states (
 nonce text primary key, user_id uuid not null references auth.users(id), shop_id uuid not null references public.shops(id),
 domain text not null, expires_at timestamptz not null default now() + interval '10 minutes'
);
alter table public.oauth_states enable row level security;
revoke all on public.oauth_states from public, anon, authenticated;
grant all on public.oauth_states to service_role;

alter table public.orders add column accounting_version integer not null default 1;
alter table public.orders alter column accounting_version set default 2;
alter table public.orders add column tracking_token text not null default encode(gen_random_bytes(32),'hex'),
 add column pod_collected_usd numeric(12,2), add column cash_discrepancy_usd numeric(12,2),
 add column location_lat numeric, add column location_lng numeric;
create unique index order_tracking_token_unique on public.orders(tracking_token);
alter table public.drivers add column cash_held_lbp numeric(18,2) not null default 0;
alter table public.settlements add column idempotency_key uuid,
 add column amount_lbp numeric(18,2) not null default 0;
create unique index settlement_idempotency_unique on public.settlements(workspace_id, idempotency_key) where idempotency_key is not null;

-- Existing bad references/amounts are preserved for reconciliation; new writes must obey these checks.
alter table public.orders add constraint order_shop_tenant foreign key(shop_id,workspace_id) references public.shops(id,workspace_id) not valid,
 add constraint order_driver_tenant foreign key(driver_id,workspace_id) references public.drivers(id,workspace_id) not valid,
 add constraint order_area_tenant foreign key(area_id,workspace_id) references public.delivery_areas(id,workspace_id) not valid,
 add constraint order_amounts_valid check(collection_usd >= 0 and delivery_fee_usd >= 0 and driver_pay_usd >= 0 and usd_to_lbp_rate > 0
 and (pod_collected_usd is null or pod_collected_usd >= 0) and (pod_collected_lbp is null or pod_collected_lbp >= 0)) not valid;
alter table public.delivery_areas add constraint area_driver_tenant foreign key(default_driver_id,workspace_id) references public.drivers(id,workspace_id) not valid,
 add constraint area_fee_valid check(fee_usd >= 0) not valid;
alter table public.settlements add constraint settlement_shop_tenant foreign key(shop_id,workspace_id) references public.shops(id,workspace_id) not valid,
 add constraint settlement_driver_tenant foreign key(driver_id,workspace_id) references public.drivers(id,workspace_id) not valid,
 add constraint settlement_target_valid check(
 (type='shop_payment' and shop_id is not null and driver_id is null and amount_usd <> 0 and amount_lbp=0) or
 (type in ('driver_cash_remittance','driver_pay') and driver_id is not null and shop_id is null and amount_usd>=0 and amount_lbp>=0 and (amount_usd>0 or amount_lbp>0))
 ) not valid;
alter table public.workspaces add constraint workspace_rate_valid check(usd_to_lbp>0) not valid;

-- Legacy merchant memberships are excluded from staff privileges without trusting metadata.
create or replace function public.my_role(ws_id uuid) returns public.user_role
language sql security definer stable set search_path=public,pg_temp as $$
 select m.role from public.workspace_members m where m.workspace_id=ws_id and m.user_id=(select auth.uid())
 and not (m.role='readonly' and exists(select 1 from public.shops s where s.user_id=m.user_id and s.workspace_id=m.workspace_id))
$$;
create or replace function public.is_member(ws_id uuid) returns boolean
language sql security definer stable set search_path=public,pg_temp as $$ select public.my_role(ws_id) is not null $$;
drop policy if exists "anyone can read their own invitation by token" on public.invitations;
-- Application mutations go through authenticated server routes, not arbitrary direct REST writes.
revoke insert,update,delete on public.workspaces, public.workspace_members, public.invitations,
 public.delivery_areas, public.shops, public.drivers, public.orders, public.settlements from anon,authenticated;
revoke all on public.invitations from anon;
drop policy if exists "members view shops" on public.shops;
create policy "staff or shop owner reads shop" on public.shops for select to authenticated
 using (public.my_role(workspace_id) in ('owner','manager','readonly') or user_id=(select auth.uid()));
create policy "merchant reads own orders" on public.orders for select to authenticated
 using (exists(select 1 from public.shops s where s.id=shop_id and s.user_id=(select auth.uid()) and s.active));

create table public.money_ledger (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
 order_id uuid references public.orders(id), settlement_id uuid references public.settlements(id),
 shop_id uuid references public.shops(id), driver_id uuid references public.drivers(id),
 shop_delta numeric(18,2) not null default 0, cash_delta numeric(18,2) not null default 0,
 lbp_delta numeric(18,2) not null default 0, pay_delta numeric(18,2) not null default 0,
 reason text not null, created_at timestamptz not null default now()
);
alter table public.money_ledger enable row level security;
revoke all on public.money_ledger from anon,authenticated;
grant select on public.money_ledger to authenticated;
grant all on public.money_ledger to service_role;
create policy "managers read ledger" on public.money_ledger for select to authenticated using(public.my_role(workspace_id) in ('owner','manager'));
-- Opening balances preserve the existing state; they do not claim history was reconciled.
insert into public.money_ledger(workspace_id,shop_id,shop_delta,reason) select workspace_id,id,balance_usd,'opening balance - requires reconciliation' from public.shops;
insert into public.money_ledger(workspace_id,driver_id,cash_delta,pay_delta,reason) select workspace_id,id,cash_held_usd,pay_owed_usd,'opening balance - requires reconciliation' from public.drivers;

create table public.order_events(
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
 order_id uuid not null references public.orders(id), old_status public.order_status, new_status public.order_status not null,
 created_at timestamptz not null default now()
);
alter table public.order_events enable row level security;
revoke all on public.order_events from anon,authenticated;
grant select on public.order_events to authenticated;
grant all on public.order_events to service_role;
create policy "read events for visible orders" on public.order_events for select to authenticated using(exists(select 1 from public.orders o where o.id=order_id));
create index ledger_workspace_created on public.money_ledger(workspace_id,created_at);
create index events_order_created on public.order_events(order_id,created_at);

create or replace function public.guard_order_change() returns trigger language plpgsql
set search_path=public,pg_temp as $$
begin
 if tg_op='DELETE' then raise exception 'Archive or cancel orders; permanent deletion is disabled'; end if;
 if tg_op='UPDATE' then
  if new.workspace_id<>old.workspace_id or new.shop_id is distinct from old.shop_id or new.usd_to_lbp_rate<>old.usd_to_lbp_rate then
   raise exception 'Order workspace, shop, and exchange rate are immutable';
  end if;
  if old.status='cancelled' and new.status<>'cancelled' then raise exception 'Cancelled orders cannot be reopened'; end if;
  if new.status='cancelled' and old.status<>'pending' and old.status<>'cancelled' then raise exception 'Only pending orders can be cancelled'; end if;
 end if;
 if new.status='cancelled' then new.collection_usd:=0; new.delivery_fee_usd:=0; new.driver_pay_usd:=0; new.shop_balance_usd:=0; end if;
 if new.pod_collected_usd is not null then new.accounting_version:=2; end if;
 if new.status='delivered' then
  if tg_op='INSERT' or old.status<>'delivered' then new.delivered_at:=now(); end if;
  new.cash_discrepancy_usd:=round(coalesce(new.pod_collected_usd,new.collection_usd)+coalesce(new.pod_collected_lbp,0)/new.usd_to_lbp_rate-new.collection_usd,2);
 else new.delivered_at:=null; end if;
 return new;
end $$;
create trigger z_order_guard before insert or update or delete on public.orders for each row execute function public.guard_order_change();

create or replace function public.account_order() returns trigger language plpgsql security definer
set search_path=public,pg_temp as $$
declare r public.orders; direction numeric; n integer; cash numeric; lbp numeric; pay numeric; net numeric;
begin
 -- Both sides are accounted in the same statement transaction. Increments take row locks.
 for n in 1..2 loop
  if n=1 then
   if tg_op='INSERT' then continue; end if;
   r:=old; direction:=-1;
  else r:=new; direction:=1; end if;
  if r.status not in ('delivered','returned') then continue; end if;
  cash:=case when r.status='delivered' then case when r.accounting_version=1 then r.collection_usd else coalesce(r.pod_collected_usd,r.collection_usd) end else 0 end;
  lbp:=case when r.status='delivered' then case when r.accounting_version=1 then 0 else coalesce(r.pod_collected_lbp,0) end else 0 end;
  pay:=r.driver_pay_usd; net:=r.shop_balance_usd;
  if r.driver_id is not null then
   update public.drivers set cash_held_usd=cash_held_usd+direction*cash,
    cash_held_lbp=cash_held_lbp+direction*lbp, pay_owed_usd=pay_owed_usd+direction*pay where id=r.driver_id;
  end if;
  if r.shop_id is not null then update public.shops set balance_usd=balance_usd+direction*net where id=r.shop_id; end if;
  insert into public.money_ledger(workspace_id,order_id,shop_id,driver_id,shop_delta,cash_delta,lbp_delta,pay_delta,reason)
   values(r.workspace_id,r.id,r.shop_id,r.driver_id,case when r.shop_id is not null then direction*net else 0 end,
    case when r.driver_id is not null then direction*cash else 0 end,case when r.driver_id is not null then direction*lbp else 0 end,
    case when r.driver_id is not null then direction*pay else 0 end,case when n=1 then 'reverse previous order state' else 'apply order state' end);
 end loop;
 if tg_op='INSERT' then
  insert into public.order_events(workspace_id,order_id,new_status) values(new.workspace_id,new.id,new.status);
 elsif old.status is distinct from new.status then
  insert into public.order_events(workspace_id,order_id,old_status,new_status) values(new.workspace_id,new.id,old.status,new.status);
 end if;
 insert into public.audit_log(workspace_id,actor_id,action,entity_type,entity_id,diff)
 values(new.workspace_id,auth.uid(),'order.'||lower(tg_op),'order',new.id,jsonb_build_object('status',new.status));
 return new;
end $$;
create trigger order_accounting after insert or update on public.orders for each row execute function public.account_order();

create or replace function public.account_settlement() returns trigger language plpgsql security definer
set search_path=public,pg_temp as $$
declare cash numeric:=0; lbp numeric:=0; pay numeric:=0; net numeric:=0;
begin
 if new.order_id is not null and not exists(select 1 from public.orders where id=new.order_id and workspace_id=new.workspace_id) then raise exception 'Invalid order for settlement'; end if;
 if new.usd_to_lbp<=0 then raise exception 'Invalid exchange rate'; end if;
 if new.type='shop_payment' then net:=-new.amount_usd;
  update public.shops set balance_usd=balance_usd+net where id=new.shop_id;
 elsif new.type='driver_cash_remittance' then
  cash:=-new.amount_usd; lbp:=-new.amount_lbp;
  update public.drivers set cash_held_usd=cash_held_usd+cash,cash_held_lbp=cash_held_lbp+lbp
   where id=new.driver_id and cash_held_usd>=new.amount_usd and cash_held_lbp>=new.amount_lbp;
  if not found then raise exception 'Remittance exceeds cash held'; end if;
 else
  if new.amount_lbp<>0 then raise exception 'Driver pay must be recorded in USD'; end if;
  pay:=-new.amount_usd;
  update public.drivers set pay_owed_usd=pay_owed_usd+pay where id=new.driver_id and pay_owed_usd>=new.amount_usd;
  if not found then raise exception 'Payment exceeds pay owed'; end if;
 end if;
 insert into public.money_ledger(workspace_id,settlement_id,shop_id,driver_id,shop_delta,cash_delta,lbp_delta,pay_delta,reason)
 values(new.workspace_id,new.id,new.shop_id,new.driver_id,net,cash,lbp,pay,new.type::text);
 insert into public.audit_log(workspace_id,actor_id,action,entity_type,entity_id)
 values(new.workspace_id,new.created_by,'settlement.created','settlement',new.id);
 return new;
end $$;
create trigger settlement_accounting after insert on public.settlements for each row execute function public.account_settlement();

-- A DB-enforced rate limiter works across server instances.
create table public.request_limits(key text primary key, bucket timestamptz not null, hits integer not null);
alter table public.request_limits enable row level security;
revoke all on public.request_limits from public,anon,authenticated;
grant all on public.request_limits to service_role;
create function public.consume_limit(p_key text,p_max integer) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare count integer;
begin
 insert into public.request_limits(key,bucket,hits) values(p_key,date_trunc('minute',now()),1)
 on conflict(key) do update set bucket=excluded.bucket,hits=case when request_limits.bucket=excluded.bucket then request_limits.hits+1 else 1 end returning hits into count;
 return count<=p_max;
end $$;
revoke all on function public.consume_limit(text,integer) from public,anon,authenticated;
grant execute on function public.consume_limit(text,integer) to service_role;
commit;
