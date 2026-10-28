-- 020_driver_credentials_and_cashout_guards.sql
-- Hashed courier PINs with revocable sessions, a private phone lookup for the
-- public tracking page, and race-safe merchant payouts.
-- Requires pgcrypto (enabled in 001). On Supabase it lives in the "extensions" schema.

begin;

-- ─── 1. Phone normalization shared by courier login and tracking lookup ───
create or replace function public.phone_core(p_phone text) returns text
language sql immutable set search_path = public, pg_temp as $$
  select case
    when d like '961%' and length(d) >= 10 then substr(d, 4)
    when d like '0%' and length(d) >= 8 then substr(d, 2)
    else d
  end
  from (select regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g') as d) s
$$;

-- ─── 2. Courier credentials (never readable by app users) ───
create table if not exists public.driver_credentials (
  driver_id       uuid primary key references public.drivers(id) on delete cascade,
  pin_hash        text not null,
  session_version integer not null default 1,
  updated_at      timestamptz not null default now()
);
alter table public.driver_credentials enable row level security;
revoke all on public.driver_credentials from public, anon, authenticated;
grant all on public.driver_credentials to service_role;

-- Carry over PINs that were deliberately set. The shared default '1234' is not
-- carried over: those couriers need dispatch to issue a new PIN.
do $$ begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'drivers' and column_name = 'pin_code') then
    insert into public.driver_credentials(driver_id, pin_hash)
    select id, crypt(pin_code, gen_salt('bf', 10)) from public.drivers
    where pin_code ~ '^[0-9]{4,8}$' and pin_code <> '1234'
    on conflict (driver_id) do nothing;
    alter table public.drivers drop column pin_code;
  end if;
end $$;

-- Setting a PIN signs the courier out of every device.
create or replace function public.set_driver_pin(p_driver uuid, p_pin text) returns boolean
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  if p_pin is null or p_pin !~ '^[0-9]{4,8}$' then raise exception 'PIN must be 4 to 8 digits'; end if;
  insert into public.driver_credentials(driver_id, pin_hash)
  values (p_driver, crypt(p_pin, gen_salt('bf', 10)))
  on conflict (driver_id) do update
    set pin_hash = excluded.pin_hash,
        session_version = public.driver_credentials.session_version + 1,
        updated_at = now();
  return true;
end $$;

create or replace function public.verify_driver_login(p_phone text, p_pin text)
returns table(driver_id uuid, name text, session_version integer)
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select d.id, d.name, c.session_version
  from public.drivers d
  join public.driver_credentials c on c.driver_id = d.id
  where d.active
    and length(public.phone_core(p_phone)) >= 7
    and public.phone_core(d.phone) = public.phone_core(p_phone)
    and c.pin_hash = crypt(p_pin, c.pin_hash)
$$;

revoke all on function public.set_driver_pin(uuid, text) from public, anon, authenticated;
revoke all on function public.verify_driver_login(text, text) from public, anon, authenticated;
grant execute on function public.set_driver_pin(uuid, text) to service_role;
grant execute on function public.verify_driver_login(text, text) to service_role;

-- ─── 3. Public "track by phone": exact number only, no addresses ───
create index if not exists orders_recipient_phone_core_idx on public.orders (public.phone_core(recipient_phone));

create or replace function public.track_orders_by_phone(p_phone text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(t.item order by t.created_at desc), '[]'::jsonb)
  from (
    select o.created_at, jsonb_build_object(
      'id', o.id, 'code', o.code, 'status', o.status,
      'collection_usd', o.collection_usd, 'usd_to_lbp_rate', o.usd_to_lbp_rate,
      'created_at', o.created_at, 'delivered_at', o.delivered_at,
      'shop', case when s.id is null then null else jsonb_build_object('name', s.name) end,
      'area', case when a.id is null then null else jsonb_build_object('name', a.name) end,
      'driver', case when d.id is null then null else jsonb_build_object('name', d.name, 'phone', d.phone) end
    ) as item
    from public.orders o
    left join public.shops s on s.id = o.shop_id
    left join public.delivery_areas a on a.id = o.area_id
    left join public.drivers d on d.id = o.driver_id
    where length(public.phone_core(p_phone)) >= 7
      and public.phone_core(o.recipient_phone) = public.phone_core(p_phone)
      and o.created_at > now() - interval '90 days'
    order by o.created_at desc
    limit 20
  ) t
$$;
revoke all on function public.track_orders_by_phone(text) from public, anon, authenticated;
grant execute on function public.track_orders_by_phone(text) to service_role;

-- ─── 4. Merchant payouts: no direct writes, no overdraw, no double payment ───
drop policy if exists "Shops can create cashout requests" on public.cashout_requests;
drop policy if exists "Workspace staff can view and manage cashout requests" on public.cashout_requests;
drop policy if exists "staff read cashout requests" on public.cashout_requests;
create policy "staff read cashout requests" on public.cashout_requests for select to authenticated
  using (public.my_role(workspace_id) in ('owner', 'manager'));
revoke insert, update, delete on public.cashout_requests from anon, authenticated;

-- Locks the shop row so two simultaneous requests cannot both spend the same balance.
create or replace function public.request_shop_cashout(
  p_shop uuid, p_amount numeric, p_method text, p_details text, p_notes text
) returns public.cashout_requests
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  s public.shops;
  reserved numeric;
  available numeric;
  rate numeric;
  result public.cashout_requests;
begin
  select * into s from public.shops where id = p_shop and active for update;
  if not found then raise exception 'Shop not found'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Requested amount must be greater than $0.00'; end if;
  select coalesce(sum(amount_usd), 0) into reserved from public.cashout_requests
    where shop_id = p_shop and status in ('pending', 'approved');
  available := greatest(round(coalesce(s.balance_usd, 0) - reserved, 2), 0);
  if p_amount > available then
    raise exception 'Requested amount ($%) exceeds eligible available balance ($%).',
      to_char(p_amount, 'FM999999990.00'), to_char(available, 'FM999999990.00');
  end if;
  select usd_to_lbp into rate from public.workspaces where id = s.workspace_id;
  insert into public.cashout_requests(workspace_id, shop_id, amount_usd, amount_lbp, method, account_details, notes, status)
  values (s.workspace_id, p_shop, p_amount, round(p_amount * coalesce(rate, 89500)), p_method, p_details, p_notes, 'pending')
  returning * into result;
  return result;
end $$;

-- Pays a request exactly once. The request ID doubles as the settlement's
-- idempotency key, so even a retried call cannot create a second payment.
-- Shop payments are booked in USD only (settlement_target_valid requires
-- amount_lbp = 0); the LBP equivalent stays on the cashout request.
create or replace function public.mark_cashout_paid(p_request uuid, p_workspace uuid, p_user uuid)
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r public.cashout_requests;
  new_settlement uuid;
begin
  select * into r from public.cashout_requests where id = p_request and workspace_id = p_workspace for update;
  if not found then raise exception 'Cashout request not found'; end if;
  if r.status not in ('pending', 'approved') then raise exception 'This request is already %', r.status; end if;
  insert into public.settlements(workspace_id, shop_id, type, amount_usd, amount_lbp, usd_to_lbp, note, created_by, idempotency_key)
  select p_workspace, r.shop_id, 'shop_payment', r.amount_usd, 0, w.usd_to_lbp,
         'Payout via ' || r.method || ' (' || r.account_details || ')' || coalesce(' - ' || nullif(r.notes, ''), ''),
         p_user, r.id
  from public.workspaces w where w.id = p_workspace
  returning id into new_settlement;
  update public.cashout_requests
    set status = 'paid', processed_by = p_user, processed_at = now(), updated_at = now()
    where id = p_request;
  return new_settlement;
end $$;

revoke all on function public.request_shop_cashout(uuid, numeric, text, text, text) from public, anon, authenticated;
revoke all on function public.mark_cashout_paid(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.request_shop_cashout(uuid, numeric, text, text, text) to service_role;
grant execute on function public.mark_cashout_paid(uuid, uuid, uuid) to service_role;

commit;
