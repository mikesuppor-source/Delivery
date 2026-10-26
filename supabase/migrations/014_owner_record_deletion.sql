-- ============================================================
-- Cedar Delivery Desk — Database Schema
-- Migration 014: Allow Workspace Owner to Delete Order Records
-- ============================================================

-- 1. Update guard_order_change() to allow deletion when app.allow_owner_delete is active
create or replace function public.set_allow_owner_delete(p_allow boolean)
returns boolean language plpgsql as $_$
begin
  if p_allow then
    perform set_config('app.allow_owner_delete', 'true', false);
  else
    perform set_config('app.allow_owner_delete', 'false', false);
  end if;
  return true;
end $_$;

create or replace function public.guard_order_change() returns trigger language plpgsql
set search_path=public,pg_temp as $_$
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
 end if;
 if new.status='cancelled' then new.collection_usd:=0; new.delivery_fee_usd:=0; new.driver_pay_usd:=0; new.shop_balance_usd:=0; end if;
 if new.pod_collected_usd is not null then new.accounting_version:=2; end if;
 if new.status='delivered' then
  if tg_op='INSERT' or old.status<>'delivered' then new.delivered_at:=now(); end if;
  new.cash_discrepancy_usd:=round(coalesce(new.pod_collected_usd,new.collection_usd)+coalesce(new.pod_collected_lbp,0)/new.usd_to_lbp_rate-new.collection_usd,2);
 else new.delivered_at:=null; end if;
 return new;
end $_$;

-- 2. Foreign Key Cascades & Nullification on Order Deletion
do $$ begin
  alter table public.order_events drop constraint if exists order_events_order_id_fkey;
  alter table public.order_events add constraint order_events_order_id_fkey foreign key (order_id) references public.orders(id) on delete cascade;

  alter table public.order_attachments drop constraint if exists order_attachments_order_id_fkey;
  alter table public.order_attachments add constraint order_attachments_order_id_fkey foreign key (order_id) references public.orders(id) on delete cascade;

  alter table public.money_ledger drop constraint if exists money_ledger_order_id_fkey;
  alter table public.money_ledger add constraint money_ledger_order_id_fkey foreign key (order_id) references public.orders(id) on delete set null;
exception when others then null;
end $$;
