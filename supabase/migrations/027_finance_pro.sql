-- 027_finance_pro.sql
-- Phase 6: Finance pro.
--   * payout schedule and batch payout runs for shops and couriers (idempotent, race-safe)
--   * courier pay modes (fixed rate or percent of the fee) and weekly delivery bonuses
--   * company expenses and the monthly P&L
--   * exchange-rate history
--   * shop statements (opening balance, movements, closing balance) straight from the money ledger
-- Money moves only through the existing settlement / ledger triggers or the locked functions below.
-- App users can read finance tables (owner and manager only); every write goes through a server route.

begin;
set local search_path = public, extensions;

-- ─── 1. Workspace payout schedule and logo ───────────────────────────────────
alter table public.workspaces
  add column if not exists payout_days text[] not null default array['monday', 'thursday'],
  add column if not exists payout_min_usd numeric(10,2) not null default 20,
  add column if not exists logo_url text;

do $$ begin
  alter table public.workspaces add constraint workspace_payout_valid check (
    payout_min_usd >= 0
    and payout_days <@ array['monday','tuesday','wednesday','thursday','friday','saturday','sunday']::text[]
  );
exception when duplicate_object then null; end $$;

-- ─── 2. Shop payout preference ───────────────────────────────────────────────
alter table public.shops
  add column if not exists payout_method text not null default 'cash',
  add column if not exists payout_account text;

do $$ begin
  alter table public.shops add constraint shop_payout_valid check (
    payout_method in ('cash', 'whish', 'omt', 'bank')
    and (payout_account is null or char_length(payout_account) <= 200)
  );
exception when duplicate_object then null; end $$;

-- ─── 3. Courier pay mode ─────────────────────────────────────────────────────
alter table public.drivers
  add column if not exists pay_mode text not null default 'fixed',
  add column if not exists pay_percent numeric(5,2);

do $$ begin
  alter table public.drivers add constraint driver_pay_mode_valid check (
    pay_mode in ('fixed', 'percent')
    and (pay_percent is null or (pay_percent >= 0 and pay_percent <= 100))
    and (pay_mode = 'fixed' or pay_percent is not null)
  );
exception when duplicate_object then null; end $$;

-- A percent courier is paid a share of the customer fee, priced when the order is assigned.
-- Fixed couriers keep the zone / workspace rate saved on the order (Phase 1). Delivered, returned
-- and cancelled orders are never touched: their money is already booked by account_order.
create or replace function public.apply_driver_pay_mode() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  d public.drivers;
  old_mode text;
  base numeric;
  driver_changed boolean := tg_op = 'INSERT' or new.driver_id is distinct from old.driver_id;
  -- A fee edit re-prices the share, unless pay was edited in the same statement (manager override)
  fee_changed boolean := tg_op = 'UPDATE' and new.delivery_fee_usd is distinct from old.delivery_fee_usd
                         and new.driver_pay_usd is not distinct from old.driver_pay_usd;
begin
  if new.status in ('delivered', 'returned', 'cancelled') then return new; end if;
  if not (driver_changed or fee_changed) then return new; end if;

  if new.driver_id is not null then
    select * into d from public.drivers where id = new.driver_id;
    if found and d.pay_mode = 'percent' then
      new.driver_pay_usd := round(new.delivery_fee_usd * d.pay_percent / 100, 2);
      return new;
    end if;
  end if;

  -- Moved off a percent courier: go back to the zone rate, then the workspace default, then 1
  if tg_op = 'UPDATE' and driver_changed and old.driver_id is not null then
    select pay_mode into old_mode from public.drivers where id = old.driver_id;
    if old_mode = 'percent' then
      select coalesce(a.driver_pay_usd, w.default_driver_pay_usd, 1) into base
      from public.workspaces w
      left join public.delivery_areas a on a.id = new.area_id and a.workspace_id = w.id
      where w.id = new.workspace_id;
      new.driver_pay_usd := base;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists order_driver_pay_mode on public.orders;
create trigger order_driver_pay_mode
  before insert or update of driver_id, delivery_fee_usd on public.orders
  for each row execute function public.apply_driver_pay_mode();

-- ─── 4. Weekly bonus rules and the bonuses awarded ───────────────────────────
create table if not exists public.driver_bonus_rules (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces(id) on delete cascade,
  name           text not null check (char_length(btrim(name)) between 1 and 100),
  min_deliveries integer not null check (min_deliveries > 0),
  bonus_usd      numeric(10,2) not null check (bonus_usd > 0),
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  unique (id, workspace_id)
);

-- One bonus per courier per week: the highest rule reached. Bonuses are the record of what was
-- credited to drivers.pay_owed_usd; nothing else writes this table.
create table if not exists public.driver_bonuses (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspaces(id) on delete cascade,
  driver_id        uuid not null,
  rule_id          uuid,
  week_start       date not null,
  deliveries_count integer not null check (deliveries_count >= 0),
  bonus_usd        numeric(10,2) not null check (bonus_usd > 0),
  note             text,
  created_at       timestamptz not null default now(),
  constraint driver_bonus_driver_tenant foreign key (driver_id, workspace_id)
    references public.drivers(id, workspace_id) on delete cascade,
  constraint driver_bonus_rule_tenant foreign key (rule_id, workspace_id)
    references public.driver_bonus_rules(id, workspace_id) on delete set null (rule_id),
  constraint driver_bonus_once_per_week unique (driver_id, week_start),
  constraint driver_bonus_week_is_monday check (extract(isodow from week_start) = 1)
);
create index if not exists driver_bonuses_workspace_week_idx on public.driver_bonuses(workspace_id, week_start);

-- ─── 5. Payout runs ──────────────────────────────────────────────────────────
-- One row per "Pay selected" click. The idempotency key makes a retried request return the
-- first result instead of paying twice; payload_hash catches a key reused for something else.
create table if not exists public.payout_runs (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspaces(id) on delete cascade,
  idempotency_key  uuid not null,
  payload_hash     text not null,
  type             text not null check (type in ('shop_payout', 'driver_payout')),
  total_amount_usd numeric(12,2) not null default 0 check (total_amount_usd >= 0),
  item_count       integer not null default 0 check (item_count >= 0),
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  constraint payout_run_idempotency unique (workspace_id, idempotency_key),
  unique (id, workspace_id)
);

alter table public.settlements add column if not exists payout_run_id uuid;
do $$ begin
  alter table public.settlements add constraint settlement_payout_run_tenant foreign key (payout_run_id, workspace_id)
    references public.payout_runs(id, workspace_id) on delete set null (payout_run_id);
exception when duplicate_object then null; end $$;
create index if not exists settlements_payout_run_idx on public.settlements(payout_run_id) where payout_run_id is not null;

-- ─── 6. Company expenses ─────────────────────────────────────────────────────
create table if not exists public.expenses (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  date         date not null default current_date,
  category     text not null check (category in ('fuel', 'salaries', 'rent', 'phone', 'maintenance', 'other')),
  amount_usd   numeric(12,2) not null default 0 check (amount_usd >= 0),
  amount_lbp   numeric(18,2) not null default 0 check (amount_lbp >= 0),
  -- Rate locked when the expense is booked, like orders: the P&L never moves when the rate does
  usd_to_lbp   numeric(12,2) not null check (usd_to_lbp > 0),
  note         text check (note is null or char_length(note) <= 500),
  receipt_path text,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint expense_has_amount check (amount_usd > 0 or amount_lbp > 0)
);
create index if not exists expenses_workspace_date_idx on public.expenses(workspace_id, date desc);

create or replace function public.set_expense_rate() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.usd_to_lbp is null then
    select usd_to_lbp into new.usd_to_lbp from public.workspaces where id = new.workspace_id;
  end if;
  return new;
end $$;
drop trigger if exists expense_rate_default on public.expenses;
create trigger expense_rate_default before insert on public.expenses
  for each row execute function public.set_expense_rate();

-- ─── 7. Exchange-rate history ────────────────────────────────────────────────
create table if not exists public.exchange_rates (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  rate         numeric(12,2) not null check (rate > 0),
  set_at       timestamptz not null default now(),
  set_by       uuid references auth.users(id) on delete set null
);
create index if not exists exchange_rates_workspace_idx on public.exchange_rates(workspace_id, set_at desc);

-- Every rate change is logged, whoever makes it. Server routes name the user through
-- set_workspace_rate(); a direct change by a signed-in user is attributed with auth.uid().
create or replace function public.log_workspace_exchange_rate() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' or new.usd_to_lbp is distinct from old.usd_to_lbp then
    insert into public.exchange_rates(workspace_id, rate, set_by)
    values (new.id, new.usd_to_lbp, coalesce(auth.uid(), nullif(current_setting('cedar.actor', true), '')::uuid));
  end if;
  return new;
end $$;
drop trigger if exists workspace_exchange_rate_log on public.workspaces;
create trigger workspace_exchange_rate_log after insert or update of usd_to_lbp on public.workspaces
  for each row execute function public.log_workspace_exchange_rate();

insert into public.exchange_rates(workspace_id, rate, set_at)
select w.id, w.usd_to_lbp, w.created_at from public.workspaces w
where not exists (select 1 from public.exchange_rates r where r.workspace_id = w.id);

create or replace function public.set_workspace_rate(p_workspace uuid, p_rate numeric, p_user uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_rate is null or p_rate <= 0 then raise exception 'Rate must be positive'; end if;
  perform set_config('cedar.actor', coalesce(p_user::text, ''), true);
  update public.workspaces set usd_to_lbp = p_rate where id = p_workspace;
end $$;

-- ─── 8. Row-level security: owners and managers read, the server writes ─────
do $$
declare t text;
begin
  foreach t in array array['driver_bonus_rules', 'driver_bonuses', 'payout_runs', 'expenses', 'exchange_rates'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('drop policy if exists "managers read %1$s" on public.%1$I', t);
    execute format(
      'create policy "managers read %1$s" on public.%1$I for select to authenticated using (public.my_role(workspace_id) in (''owner'', ''manager''))', t);
  end loop;
end $$;

-- ─── 9. run_shop_payouts: pay many shops in one locked, idempotent step ─────
-- p_payouts: [{"shop_id": uuid, "amount_usd": number, "note": text?}]
-- Never pays more than a shop's available balance: its balance minus cash-out requests that are
-- already pending or approved (those are reserved for request_shop_cashout / mark_cashout_paid).
create or replace function public.run_shop_payouts(p_workspace uuid, p_payouts jsonb, p_key uuid, p_user uuid default null)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_hash text;
  v_run uuid;
  v_old public.payout_runs;
  v_rate numeric;
  v_item record;
  v_shop public.shops;
  v_reserved numeric;
  v_available numeric;
  v_total numeric := 0;
  v_count integer := 0;
begin
  if jsonb_typeof(p_payouts) is distinct from 'array' or jsonb_array_length(p_payouts) = 0 then
    raise exception 'Select at least one payout';
  end if;
  if jsonb_array_length(p_payouts) > 200 then raise exception 'A payout run is limited to 200 payouts'; end if;
  if (select count(distinct e->>'shop_id') from jsonb_array_elements(p_payouts) e) <> jsonb_array_length(p_payouts) then
    raise exception 'Each shop can appear once in a payout run';
  end if;
  v_hash := md5(p_payouts::text);

  -- Claim the key. A concurrent duplicate waits here until the first run commits, then replays it.
  insert into public.payout_runs(workspace_id, idempotency_key, payload_hash, type, created_by)
  values (p_workspace, p_key, v_hash, 'shop_payout', p_user)
  on conflict (workspace_id, idempotency_key) do nothing
  returning id into v_run;

  if v_run is null then
    select * into v_old from public.payout_runs where workspace_id = p_workspace and idempotency_key = p_key;
    if v_old.payload_hash <> v_hash or v_old.type <> 'shop_payout' then
      raise exception 'Payout request ID already used for different details';
    end if;
    return jsonb_build_object('replayed', true, 'run_id', v_old.id, 'total_usd', v_old.total_amount_usd, 'count', v_old.item_count);
  end if;

  select usd_to_lbp into v_rate from public.workspaces where id = p_workspace;

  -- Shops are locked in id order so two overlapping runs cannot deadlock
  for v_item in
    select (e->>'shop_id')::uuid as shop_id, (e->>'amount_usd')::numeric as amount, nullif(btrim(e->>'note'), '') as note
    from jsonb_array_elements(p_payouts) e
    order by 1
  loop
    if v_item.amount is null or v_item.amount <= 0 or v_item.amount <> round(v_item.amount, 2) then
      raise exception 'Payout amount must be a positive amount in dollars and cents';
    end if;
    select * into v_shop from public.shops where id = v_item.shop_id and workspace_id = p_workspace for update;
    if not found then raise exception 'Shop not found in this workspace'; end if;

    select coalesce(sum(amount_usd), 0) into v_reserved from public.cashout_requests
      where shop_id = v_shop.id and status in ('pending', 'approved');
    v_available := greatest(round(v_shop.balance_usd - v_reserved, 2), 0);
    if v_item.amount > v_available then
      raise exception 'Payout of $% exceeds the available balance of $% for %',
        to_char(v_item.amount, 'FM999999990.00'), to_char(v_available, 'FM999999990.00'), v_shop.name;
    end if;

    insert into public.settlements(workspace_id, shop_id, type, amount_usd, amount_lbp, usd_to_lbp, note, created_by, payout_run_id)
    values (p_workspace, v_shop.id, 'shop_payment', v_item.amount, 0, v_rate,
            coalesce(v_item.note, 'Payout run via ' || v_shop.payout_method), p_user, v_run);
    v_total := v_total + v_item.amount;
    v_count := v_count + 1;
  end loop;

  update public.payout_runs set total_amount_usd = v_total, item_count = v_count where id = v_run;
  return jsonb_build_object('replayed', false, 'run_id', v_run, 'total_usd', v_total, 'count', v_count);
end $$;

-- ─── 10. run_driver_payouts: the same for courier pay ───────────────────────
-- p_payouts: [{"driver_id": uuid, "amount_usd": number, "note": text?}]
create or replace function public.run_driver_payouts(p_workspace uuid, p_payouts jsonb, p_key uuid, p_user uuid default null)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_hash text;
  v_run uuid;
  v_old public.payout_runs;
  v_rate numeric;
  v_item record;
  v_driver public.drivers;
  v_total numeric := 0;
  v_count integer := 0;
begin
  if jsonb_typeof(p_payouts) is distinct from 'array' or jsonb_array_length(p_payouts) = 0 then
    raise exception 'Select at least one payout';
  end if;
  if jsonb_array_length(p_payouts) > 200 then raise exception 'A payout run is limited to 200 payouts'; end if;
  if (select count(distinct e->>'driver_id') from jsonb_array_elements(p_payouts) e) <> jsonb_array_length(p_payouts) then
    raise exception 'Each courier can appear once in a pay run';
  end if;
  v_hash := md5(p_payouts::text);

  insert into public.payout_runs(workspace_id, idempotency_key, payload_hash, type, created_by)
  values (p_workspace, p_key, v_hash, 'driver_payout', p_user)
  on conflict (workspace_id, idempotency_key) do nothing
  returning id into v_run;

  if v_run is null then
    select * into v_old from public.payout_runs where workspace_id = p_workspace and idempotency_key = p_key;
    if v_old.payload_hash <> v_hash or v_old.type <> 'driver_payout' then
      raise exception 'Payout request ID already used for different details';
    end if;
    return jsonb_build_object('replayed', true, 'run_id', v_old.id, 'total_usd', v_old.total_amount_usd, 'count', v_old.item_count);
  end if;

  select usd_to_lbp into v_rate from public.workspaces where id = p_workspace;

  for v_item in
    select (e->>'driver_id')::uuid as driver_id, (e->>'amount_usd')::numeric as amount, nullif(btrim(e->>'note'), '') as note
    from jsonb_array_elements(p_payouts) e
    order by 1
  loop
    if v_item.amount is null or v_item.amount <= 0 or v_item.amount <> round(v_item.amount, 2) then
      raise exception 'Pay amount must be a positive amount in dollars and cents';
    end if;
    select * into v_driver from public.drivers where id = v_item.driver_id and workspace_id = p_workspace for update;
    if not found then raise exception 'Courier not found in this workspace'; end if;
    if v_item.amount > v_driver.pay_owed_usd then
      raise exception 'Pay of $% exceeds the $% owed to %',
        to_char(v_item.amount, 'FM999999990.00'), to_char(v_driver.pay_owed_usd, 'FM999999990.00'), v_driver.name;
    end if;

    insert into public.settlements(workspace_id, driver_id, type, amount_usd, amount_lbp, usd_to_lbp, note, created_by, payout_run_id)
    values (p_workspace, v_driver.id, 'driver_pay', v_item.amount, 0, v_rate,
            coalesce(v_item.note, 'Courier pay run'), p_user, v_run);
    v_total := v_total + v_item.amount;
    v_count := v_count + 1;
  end loop;

  update public.payout_runs set total_amount_usd = v_total, item_count = v_count where id = v_run;
  return jsonb_build_object('replayed', false, 'run_id', v_run, 'total_usd', v_total, 'count', v_count);
end $$;

-- ─── 11. apply_weekly_driver_bonuses ────────────────────────────────────────
-- For a finished Monday-to-Sunday week, awards each courier the highest active rule their delivered
-- orders reached and adds it to pay_owed_usd, with a ledger row. Safe to run again: a courier
-- gets at most one bonus per week.
create or replace function public.apply_weekly_driver_bonuses(p_workspace uuid, p_week_start date)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_row record;
  v_id uuid;
  v_awards jsonb := '[]'::jsonb;
  v_total numeric := 0;
begin
  if p_week_start is null or extract(isodow from p_week_start) <> 1 then
    raise exception 'A bonus week starts on a Monday';
  end if;
  if p_week_start + 7 > current_date then
    raise exception 'Bonuses can be calculated once the week has finished';
  end if;

  for v_row in
    with counts as (
      select o.driver_id, count(*) as deliveries
      from public.orders o
      where o.workspace_id = p_workspace and o.status = 'delivered' and o.driver_id is not null
        and o.delivered_at >= (p_week_start::timestamp at time zone 'UTC')
        and o.delivered_at < ((p_week_start + 7)::timestamp at time zone 'UTC')
      group by o.driver_id
    )
    select c.driver_id, c.deliveries, r.id as rule_id, r.name as rule_name, r.bonus_usd
    from counts c
    join lateral (
      select * from public.driver_bonus_rules r
      where r.workspace_id = p_workspace and r.active and r.min_deliveries <= c.deliveries
      order by r.min_deliveries desc, r.bonus_usd desc limit 1
    ) r on true
    order by c.driver_id
  loop
    insert into public.driver_bonuses(workspace_id, driver_id, rule_id, week_start, deliveries_count, bonus_usd, note)
    values (p_workspace, v_row.driver_id, v_row.rule_id, p_week_start, v_row.deliveries, v_row.bonus_usd,
            'Weekly bonus: ' || v_row.rule_name)
    on conflict (driver_id, week_start) do nothing
    returning id into v_id;

    if v_id is not null then
      update public.drivers set pay_owed_usd = pay_owed_usd + v_row.bonus_usd where id = v_row.driver_id;
      insert into public.money_ledger(workspace_id, driver_id, pay_delta, reason)
      values (p_workspace, v_row.driver_id, v_row.bonus_usd, 'driver bonus, week of ' || p_week_start);
      v_total := v_total + v_row.bonus_usd;
      v_awards := v_awards || jsonb_build_object('driver_id', v_row.driver_id, 'deliveries', v_row.deliveries,
                                                 'bonus_usd', v_row.bonus_usd, 'rule', v_row.rule_name);
    end if;
  end loop;

  return jsonb_build_object('week_start', p_week_start, 'bonuses_created', jsonb_array_length(v_awards),
                            'total_bonus_usd', v_total, 'awards', v_awards);
end $$;

-- ─── 12. pnl_report: monthly profit and loss ────────────────────────────────
-- revenue = customer fees + storage fees of delivered and returned orders
-- cost    = courier pay of those orders + bonuses + expenses (LBP expenses at the rate locked on them)
-- An order counts in the month it was delivered, or first marked returned (same basis as the
-- profit report). Bonuses count in the month their week starts. Dates are UTC.
create or replace function public.pnl_report(p_workspace uuid, p_from date, p_to date)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_from timestamptz := p_from::timestamp at time zone 'UTC';
  v_to timestamptz := (p_to + 1)::timestamp at time zone 'UTC';
  v_result jsonb;
begin
  if p_from is null or p_to is null or p_to < p_from then raise exception 'Invalid date range'; end if;
  if p_to - p_from > 1100 then raise exception 'The date range is limited to three years'; end if;

  with
  settled as (
    select o.status, o.delivery_fee_usd as fee, o.storage_fee_usd as storage, o.driver_pay_usd as pay,
      case when o.status = 'delivered' then o.delivered_at
           else coalesce((select min(e.created_at) from public.order_events e
                          where e.order_id = o.id and e.new_status = 'returned'), o.updated_at) end as at
    from public.orders o
    where o.workspace_id = p_workspace and o.status in ('delivered', 'returned')
  ),
  order_months as (
    select date_trunc('month', at at time zone 'UTC')::date as month,
      count(*) filter (where status = 'delivered') as delivered_orders,
      count(*) filter (where status = 'returned') as returned_orders,
      sum(fee) as delivery_fees_usd, sum(storage) as storage_fees_usd, sum(pay) as courier_pay_usd
    from settled where at >= v_from and at < v_to group by 1
  ),
  bonus_months as (
    select date_trunc('month', week_start)::date as month, sum(bonus_usd) as bonuses_usd
    from public.driver_bonuses
    where workspace_id = p_workspace and week_start between p_from and p_to group by 1
  ),
  expense_months as (
    select date_trunc('month', date)::date as month,
      sum(amount_usd) as expenses_usd, sum(round(amount_lbp / usd_to_lbp, 2)) as expenses_lbp_usd
    from public.expenses
    where workspace_id = p_workspace and date between p_from and p_to group by 1
  ),
  months as (
    select m::date as month
    from generate_series(date_trunc('month', p_from::timestamp), date_trunc('month', p_to::timestamp), interval '1 month') m
  ),
  monthly as (
    select m.month,
      coalesce(o.delivered_orders, 0) as delivered_orders,
      coalesce(o.returned_orders, 0) as returned_orders,
      coalesce(o.delivery_fees_usd, 0) as delivery_fees_usd,
      coalesce(o.storage_fees_usd, 0) as storage_fees_usd,
      coalesce(o.delivery_fees_usd, 0) + coalesce(o.storage_fees_usd, 0) as revenue_usd,
      coalesce(o.courier_pay_usd, 0) as courier_pay_usd,
      coalesce(b.bonuses_usd, 0) as bonuses_usd,
      coalesce(x.expenses_usd, 0) + coalesce(x.expenses_lbp_usd, 0) as expenses_usd
    from months m
    left join order_months o on o.month = m.month
    left join bonus_months b on b.month = m.month
    left join expense_months x on x.month = m.month
  ),
  rows as (
    select *, courier_pay_usd + bonuses_usd + expenses_usd as total_cost_usd,
              revenue_usd - courier_pay_usd - bonuses_usd - expenses_usd as net_profit_usd
    from monthly
  )
  select jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'months', coalesce((select jsonb_agg(to_jsonb(r) order by r.month) from rows r), '[]'::jsonb),
    'totals', (select jsonb_build_object(
        'delivered_orders', coalesce(sum(delivered_orders), 0), 'returned_orders', coalesce(sum(returned_orders), 0),
        'delivery_fees_usd', coalesce(sum(delivery_fees_usd), 0), 'storage_fees_usd', coalesce(sum(storage_fees_usd), 0),
        'revenue_usd', coalesce(sum(revenue_usd), 0), 'courier_pay_usd', coalesce(sum(courier_pay_usd), 0),
        'bonuses_usd', coalesce(sum(bonuses_usd), 0), 'expenses_usd', coalesce(sum(expenses_usd), 0),
        'total_cost_usd', coalesce(sum(total_cost_usd), 0), 'net_profit_usd', coalesce(sum(net_profit_usd), 0))
      from rows),
    'expenses_by_category', coalesce((
      select jsonb_agg(jsonb_build_object('category', c.category, 'amount_usd', c.amount) order by c.amount desc)
      from (select category, sum(amount_usd) + sum(round(amount_lbp / usd_to_lbp, 2)) as amount
            from public.expenses where workspace_id = p_workspace and date between p_from and p_to
            group by category) c), '[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;

-- ─── 13. shop_statement: opening balance, movements, closing balance ────────
-- Built from the money ledger, so the closing balance is exactly what the shop was owed at the end
-- of the period. An order is one line in the period it was delivered or returned; later
-- corrections to it show as an adjustment.
create or replace function public.shop_statement(p_workspace uuid, p_shop uuid, p_from date, p_to date)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_shop public.shops;
  v_from timestamptz := p_from::timestamp at time zone 'UTC';
  v_to timestamptz := (p_to + 1)::timestamp at time zone 'UTC';
  v_open numeric;
  v_lines jsonb;
  v_close numeric;
begin
  if p_from is null or p_to is null or p_to < p_from then raise exception 'Invalid date range'; end if;
  if p_to - p_from > 400 then raise exception 'A statement covers at most about a year'; end if;
  select * into v_shop from public.shops where id = p_shop and workspace_id = p_workspace;
  if not found then raise exception 'Shop not found in this workspace'; end if;

  select coalesce(sum(shop_delta), 0) into v_open from public.money_ledger
    where workspace_id = p_workspace and shop_id = p_shop and created_at < v_from;

  with moves as (
    select order_id, settlement_id, shop_delta, created_at, reason
    from public.money_ledger
    where workspace_id = p_workspace and shop_id = p_shop and created_at >= v_from and created_at < v_to
  ),
  order_moves as (
    select m.order_id, sum(m.shop_delta) as amount, max(m.created_at) as booked_at
    from moves m where m.order_id is not null group by m.order_id having sum(m.shop_delta) <> 0
  ),
  order_lines as (
    select om.booked_at as at,
      case when s.at >= v_from and s.at < v_to then 'order' else 'adjustment' end as kind,
      o.code as ref,
      case when s.at >= v_from and s.at < v_to then
             case when o.status = 'returned' then 'Returned' else 'Delivered' end
           else 'Correction' end as label,
      o.collection_usd as cod_usd, o.delivery_fee_usd as fee_usd, o.storage_fee_usd as storage_usd,
      om.amount
    from order_moves om
    join public.orders o on o.id = om.order_id
    cross join lateral (
      select case when o.status = 'delivered' then o.delivered_at
                  else coalesce((select min(e.created_at) from public.order_events e
                                 where e.order_id = o.id and e.new_status = 'returned'), o.updated_at) end as at
    ) s
  ),
  settlement_lines as (
    select m.created_at as at, 'payout'::text as kind,
      to_char(s.created_at, 'YYYY-MM-DD') as ref,
      case when m.shop_delta < 0 then 'Payout' else 'Collected from shop' end as label,
      null::numeric as cod_usd, null::numeric as fee_usd, null::numeric as storage_usd,
      m.shop_delta as amount
    from moves m join public.settlements s on s.id = m.settlement_id
    where m.settlement_id is not null
  ),
  other_lines as (
    select m.created_at as at, 'adjustment'::text as kind, null::text as ref, m.reason as label,
      null::numeric, null::numeric, null::numeric, m.shop_delta as amount
    from moves m where m.order_id is null and m.settlement_id is null and m.shop_delta <> 0
  ),
  all_lines as (
    select * from order_lines union all select * from settlement_lines union all select * from other_lines
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'at', l.at, 'kind', l.kind, 'ref', l.ref, 'label', l.label,
      'cod_usd', l.cod_usd, 'fee_usd', l.fee_usd, 'storage_usd', l.storage_usd, 'amount_usd', l.amount
    ) order by l.at, l.ref), '[]'::jsonb),
    v_open + coalesce(sum(l.amount), 0)
  into v_lines, v_close from all_lines l;

  return jsonb_build_object(
    'shop', jsonb_build_object('id', v_shop.id, 'name', v_shop.name, 'phone', v_shop.phone, 'address', v_shop.address),
    'from', p_from, 'to', p_to,
    'opening_usd', v_open, 'closing_usd', v_close, 'current_balance_usd', v_shop.balance_usd,
    'lines', v_lines
  );
end $$;

-- ─── 14. Functions are for the server only ──────────────────────────────────
revoke all on function public.run_shop_payouts(uuid, jsonb, uuid, uuid) from public, anon, authenticated;
revoke all on function public.run_driver_payouts(uuid, jsonb, uuid, uuid) from public, anon, authenticated;
revoke all on function public.apply_weekly_driver_bonuses(uuid, date) from public, anon, authenticated;
revoke all on function public.pnl_report(uuid, date, date) from public, anon, authenticated;
revoke all on function public.shop_statement(uuid, uuid, date, date) from public, anon, authenticated;
revoke all on function public.set_workspace_rate(uuid, numeric, uuid) from public, anon, authenticated;
grant execute on function public.run_shop_payouts(uuid, jsonb, uuid, uuid) to service_role;
grant execute on function public.run_driver_payouts(uuid, jsonb, uuid, uuid) to service_role;
grant execute on function public.apply_weekly_driver_bonuses(uuid, date) to service_role;
grant execute on function public.pnl_report(uuid, date, date) to service_role;
grant execute on function public.shop_statement(uuid, uuid, date, date) to service_role;
grant execute on function public.set_workspace_rate(uuid, numeric, uuid) to service_role;

commit;
