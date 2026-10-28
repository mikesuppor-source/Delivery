-- pgcrypto (gen_random_bytes, crypt) lives in "extensions" on Supabase; the CLI does not search it by default
set search_path = public, extensions;

-- ============================================================
-- Cedar Delivery Desk — Merchant Portal & Unique Barcodes
-- Migration 003: Unique order codes & shop owner account link
-- ============================================================

-- 1. Ensure shops can be linked to an authenticated user (for Merchant Portal)
alter table public.shops
  add column if not exists user_id uuid references auth.users(id),
  add column if not exists prefix text;

-- 2. Add Unique Index on order tracking code so barcode IDs CAN NEVER BE REPEATED
-- (Case-insensitive unique index)
create unique index if not exists orders_unique_code_idx
  on public.orders (lower(code));

-- 3. Update the trigger function with a collision-proof loop to guarantee unique codes
create or replace function public.set_order_defaults()
returns trigger language plpgsql as $$
declare
  candidate_code text;
  code_exists boolean;
begin
  -- If code is empty or null, auto-generate a guaranteed unique barcode ID
  if new.code is null or trim(new.code) = '' then
    loop
      candidate_code := 'CD-' || upper(substr(encode(gen_random_bytes(5), 'hex'), 1, 8));
      select exists(
        select 1 from public.orders where lower(code) = lower(candidate_code)
      ) into code_exists;

      if not code_exists then
        new.code := candidate_code;
        exit;
      end if;
    end loop;
  else
    -- Normalize code to uppercase and trimmed
    new.code := upper(trim(new.code));
  end if;

  -- Ensure shop balance is calculated
  new.shop_balance_usd := new.collection_usd - new.delivery_fee_usd;
  new.updated_at := now();
  return new;
end;
$$;
