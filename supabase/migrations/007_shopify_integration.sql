-- Migration 007: Shopify Integration for Merchant Stores & Webhooks
alter table public.shops 
add column if not exists api_key text unique,
add column if not exists shopify_domain text,
add column if not exists shopify_access_token text;

-- Generate unique api_key for existing shops
update public.shops 
set api_key = 'cdr_shop_' || encode(gen_random_bytes(16), 'hex') 
where api_key is null;

-- Add index on api_key for fast webhook routing
create index if not exists idx_shops_api_key on public.shops(api_key);
create index if not exists idx_shops_shopify_domain on public.shops(shopify_domain);

-- Store Shopify reference on orders
alter table public.orders
add column if not exists shopify_order_id text,
add column if not exists shopify_order_number text;

create index if not exists idx_orders_shopify_order_id on public.orders(shopify_order_id);
