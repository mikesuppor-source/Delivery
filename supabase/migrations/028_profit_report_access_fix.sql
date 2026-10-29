-- 028_profit_report_access_fix.sql
-- Two fixes to profit_report (migration 022):
--
-- 1. Access. my_role() returns NULL for anyone who is not a member of the workspace, and
--    "NULL not in ('owner','manager')" is NULL, not true, so the role check let strangers through:
--    any signed-in user could read another company's profit report by its workspace id.
--    The check now also refuses a missing role. The function only works for a signed-in owner or
--    manager; the API route calls it with the user's own session, not the service role.
--
-- 2. Dates. Delivered orders are counted on delivered_at, as the build plan says. updated_at moves
--    whenever an order is touched later (a rating, a hand-over, a storage fee), which shifted
--    profit between days and months and made it disagree with the P&L report.

begin;

create or replace function public.profit_report(
  p_workspace uuid,
  p_from      timestamptz,
  p_to        timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.my_role(p_workspace);
  v_result jsonb;
begin
  -- Only owners and managers may view profit data
  if v_role is null or v_role not in ('owner', 'manager') then
    raise exception 'Forbidden: profit report requires owner or manager role';
  end if;

  with
  -- Delivered: counted when it was delivered
  -- Returned:  counted when it was first marked returned (order_events)
  delivered_orders as (
    select
      o.id,
      o.area_id,
      o.driver_id,
      o.shop_id,
      o.delivery_fee_usd,
      o.driver_pay_usd,
      o.collection_usd,
      'delivered' as result_type,
      o.delivered_at as settled_at
    from orders o
    where o.workspace_id = p_workspace
      and o.status = 'delivered'
      and o.delivered_at between p_from and p_to
  ),
  returned_orders as (
    select
      o.id,
      o.area_id,
      o.driver_id,
      o.shop_id,
      o.delivery_fee_usd,
      o.driver_pay_usd,
      o.collection_usd,
      'returned' as result_type,
      coalesce(oe.created_at, o.updated_at) as settled_at
    from orders o
    left join (
      select order_id, min(created_at) as created_at
      from order_events
      where workspace_id = p_workspace and new_status = 'returned'
      group by order_id
    ) oe on oe.order_id = o.id
    where o.workspace_id = p_workspace
      and o.status = 'returned'
      and coalesce(oe.created_at, o.updated_at) between p_from and p_to
  ),
  all_orders as (
    select * from delivered_orders
    union all
    select * from returned_orders
  ),

  -- Summary totals
  totals as (
    select
      count(*) filter (where result_type = 'delivered') as orders_delivered,
      count(*) filter (where result_type = 'returned')  as orders_returned,
      coalesce(sum(delivery_fee_usd) filter (where result_type = 'delivered'), 0) as customer_fees_usd,
      coalesce(sum(driver_pay_usd)   filter (where result_type = 'delivered'), 0) as courier_pay_usd,
      coalesce(sum(delivery_fee_usd - driver_pay_usd) filter (where result_type = 'delivered'), 0) as profit_usd,
      coalesce(sum(collection_usd)   filter (where result_type = 'delivered'), 0) as cod_collected_usd
    from all_orders
  ),

  -- By zone
  by_zone as (
    select
      a.id as area_id,
      a.name as area_name,
      count(*) as orders_count,
      sum(o.delivery_fee_usd) as fees_usd,
      sum(o.driver_pay_usd)   as courier_pay_usd,
      sum(o.delivery_fee_usd - o.driver_pay_usd) as profit_usd
    from all_orders o
    left join delivery_areas a on a.id = o.area_id
    group by a.id, a.name
    order by profit_usd desc
  ),

  -- By courier
  by_driver as (
    select
      d.id as driver_id,
      d.name as driver_name,
      count(*) as orders_count,
      sum(o.delivery_fee_usd) as fees_usd,
      sum(o.driver_pay_usd)   as courier_pay_usd,
      sum(o.delivery_fee_usd - o.driver_pay_usd) as profit_usd
    from all_orders o
    left join drivers d on d.id = o.driver_id
    group by d.id, d.name
    order by orders_count desc
  ),

  -- By shop
  by_shop as (
    select
      s.id as shop_id,
      s.name as shop_name,
      count(*) as orders_count,
      sum(o.delivery_fee_usd) as fees_usd,
      sum(o.driver_pay_usd)   as courier_pay_usd,
      sum(o.delivery_fee_usd - o.driver_pay_usd) as profit_usd
    from all_orders o
    left join shops s on s.id = o.shop_id
    group by s.id, s.name
    order by orders_count desc
  )

  select into v_result jsonb_build_object(
    'totals',   row_to_json(t.*),
    'by_zone',  coalesce((select jsonb_agg(row_to_json(z.*)) from by_zone z), '[]'),
    'by_driver', coalesce((select jsonb_agg(row_to_json(d.*)) from by_driver d), '[]'),
    'by_shop',  coalesce((select jsonb_agg(row_to_json(s.*)) from by_shop s), '[]')
  )
  from totals t;

  return v_result;
end;
$$;

revoke execute on function public.profit_report(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant  execute on function public.profit_report(uuid, timestamptz, timestamptz) to authenticated;

commit;
