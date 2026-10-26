-- ============================================================
-- Cedar Delivery Desk — Database Schema
-- Migration 014: Allow Workspace Owner to Delete Order Records
-- ============================================================

-- 1. Update guard_order_change() to allow deletion when app.allow_owner_delete is active
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

-- 2. Atomic procedure for Owner to permanently delete orders and related entries
create or replace function public.owner_delete_orders(p_workspace_id uuid, p_order_ids uuid[])
returns integer language plpgsql security definer
set search_path=public,pg_temp as $_$
declare
  v_count integer;
begin
  -- Authorize deletion for this transaction
  perform set_config('app.allow_owner_delete', 'true', true);

  -- 1. Remove order tracking events
  delete from public.order_events
  where workspace_id = p_workspace_id and order_id = any(p_order_ids);

  -- 2. Remove attachments
  delete from public.order_attachments
  where order_id = any(p_order_ids);

  -- 3. Unlink financial ledger entries to preserve accounting history without foreign key lock
  update public.money_ledger
  set order_id = null
  where workspace_id = p_workspace_id and order_id = any(p_order_ids);

  -- 4. Unlink settlements
  update public.settlements
  set order_id = null
  where workspace_id = p_workspace_id and order_id = any(p_order_ids);

  -- 5. Delete the order records
  delete from public.orders
  where workspace_id = p_workspace_id and id = any(p_order_ids);

  get diagnostics v_count = row_count;

  -- Reset authorization
  perform set_config('app.allow_owner_delete', 'false', true);

  return v_count;
end $_$;
