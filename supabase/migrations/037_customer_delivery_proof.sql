-- Proof of delivery that the customer controls.
-- Every order gets a 4-digit delivery code that only the customer sees (on their tracking link). The courier asks for it
-- at the door and the server checks it. The codes live in a server-only table, so no courier, shop or staff login can read
-- them. The order records how delivery was proved, where the courier was, and anything that needs a second look.
begin;

create table public.order_delivery_codes (
  order_id uuid primary key references public.orders(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  code text not null check (code ~ '^[0-9]{4}$'),
  attempts integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.order_delivery_codes enable row level security;
revoke all on public.order_delivery_codes from public, anon, authenticated;
grant all on public.order_delivery_codes to service_role;

alter table public.orders
  add column if not exists proof_method text check (proof_method in ('code', 'fallback', 'legacy')),
  add column if not exists proof_flags text[] not null default '{}',
  add column if not exists proof_reason text,
  add column if not exists proof_lat double precision,
  add column if not exists proof_lng double precision,
  add column if not exists proof_distance_m integer,
  add column if not exists proof_reviewed_at timestamptz,
  add column if not exists customer_confirmed_at timestamptz,
  add column if not exists customer_disputed_at timestamptz,
  add column if not exists customer_dispute_note text;

create index if not exists orders_proof_review_idx on public.orders (workspace_id) where cardinality(proof_flags) > 0 and proof_reviewed_at is null;

create function public.new_delivery_code() returns text
language sql volatile set search_path = public, extensions, pg_temp as $$
  select lpad(((('x' || encode(gen_random_bytes(3), 'hex'))::bit(24)::int) % 10000)::text, 4, '0')
$$;

create function public.create_order_delivery_code() returns trigger
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  insert into public.order_delivery_codes (order_id, workspace_id, code) values (new.id, new.workspace_id, public.new_delivery_code()) on conflict do nothing;
  return new;
end $$;
create trigger order_delivery_code after insert on public.orders
  for each row execute function public.create_order_delivery_code();

-- Orders still on their way get a code too
insert into public.order_delivery_codes (order_id, workspace_id, code)
select o.id, o.workspace_id, public.new_delivery_code() from public.orders o
where o.status in ('pending', 'assigned', 'picked_up', 'failed') on conflict do nothing;

-- Checks a code the courier typed or scanned. Five wrong tries lock the code for that order.
-- Answers {"result": "ok" | "wrong" | "locked" | "none", "triesLeft": n}.
create function public.check_delivery_code(p_order uuid, p_code text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_row public.order_delivery_codes%rowtype;
begin
  select * into v_row from public.order_delivery_codes where order_id = p_order for update;
  if not found then return jsonb_build_object('result', 'none', 'triesLeft', 0); end if;
  if v_row.attempts >= 5 then return jsonb_build_object('result', 'locked', 'triesLeft', 0); end if;
  if v_row.code = btrim(coalesce(p_code, '')) then return jsonb_build_object('result', 'ok', 'triesLeft', 5 - v_row.attempts); end if;
  update public.order_delivery_codes set attempts = attempts + 1 where order_id = p_order;
  return jsonb_build_object('result', case when v_row.attempts + 1 >= 5 then 'locked' else 'wrong' end, 'triesLeft', greatest(0, 4 - v_row.attempts));
end $$;

-- The customer answers "did you receive it?" from their own tracking link (the 64-character token). "No" raises a flag
-- for the owner. Only a delivered order, only within 14 days, only once.
create function public.customer_respond_delivery(p_token text, p_received boolean, p_note text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_order public.orders%rowtype;
begin
  if p_token !~ '^[a-f0-9]{64}$' then return jsonb_build_object('result', 'not_found'); end if;
  select * into v_order from public.orders where tracking_token = p_token for update;
  if not found then return jsonb_build_object('result', 'not_found'); end if;
  if v_order.status <> 'delivered' or coalesce(v_order.delivered_at, v_order.updated_at) < now() - interval '14 days' then return jsonb_build_object('result', 'closed'); end if;
  if v_order.customer_confirmed_at is not null or v_order.customer_disputed_at is not null then return jsonb_build_object('result', 'already'); end if;
  if p_received then
    update public.orders set customer_confirmed_at = now() where id = v_order.id;
    return jsonb_build_object('result', 'confirmed');
  end if;
  update public.orders
     set customer_disputed_at = now(), customer_dispute_note = left(nullif(btrim(coalesce(p_note, '')), ''), 500),
         proof_flags = array_append(proof_flags, 'customer_disputed'), proof_reviewed_at = null
   where id = v_order.id;
  return jsonb_build_object('result', 'disputed');
end $$;

revoke all on function public.new_delivery_code() from public, anon, authenticated;
revoke all on function public.create_order_delivery_code() from public, anon, authenticated;
revoke all on function public.check_delivery_code(uuid, text) from public, anon, authenticated;
revoke all on function public.customer_respond_delivery(text, boolean, text) from public, anon, authenticated;
grant execute on function public.new_delivery_code() to service_role;
grant execute on function public.create_order_delivery_code() to service_role;
grant execute on function public.check_delivery_code(uuid, text) to service_role;
grant execute on function public.customer_respond_delivery(text, boolean, text) to service_role;

commit;
